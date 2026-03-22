use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use super::args::build_start_args;
use super::cleanup::cleanup_port;
use super::state::{log_engine_stdout, path_to_safe_string, EngineState};

/// Spawns the aria2c engine process with the given configuration.
/// Creates the download directory, cleans up stale port listeners, and passes
/// whitelisted config keys as CLI arguments.
pub fn start_engine(app: &tauri::AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let state = app.state::<EngineState>();
    let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;

    if child_lock.is_some() {
        return Ok(());
    }

    // Ensure the download directory exists
    if let Some(dir) = config.get("dir").and_then(|v| v.as_str()) {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create download directory '{}': {}", dir, e))?;
    }

    // Kill any leftover aria2c process on the RPC port before starting
    let port = config
        .get("rpc-listen-port")
        .and_then(|v| v.as_str())
        .unwrap_or("16800");
    cleanup_port(port);

    // Resolve aria2.conf via Tauri's resource directory — correct for all
    // platforms, including macOS .app bundles where resources live in
    // Contents/Resources/ rather than next to the executable.
    let conf_path = app
        .path()
        .resolve("binaries/aria2.conf", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve conf path: {}", e))?;
    let conf_str = path_to_safe_string(&conf_path);

    // Session file for persisting active/paused downloads across restarts
    let session_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("download.session");
    let session_str = path_to_safe_string(&session_path);

    // Ensure the app data directory exists
    if let Some(parent) = session_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let args = build_start_args(
        config,
        if conf_path.exists() {
            log::info!("loading engine config: {}", conf_str);
            Some(&conf_str)
        } else {
            log::warn!(
                "engine config not found: {}, starting with defaults",
                conf_str
            );
            None
        },
        &session_str,
        session_path.exists(),
    );

    let sidecar = app
        .shell()
        .sidecar("motrixnext-aria2c")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(&args);

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn aria2c: {}", e))?;

    log::info!("started engine process: PID {}", child.pid());

    let spawned_pid = child.pid();
    *child_lock = Some(child);
    let my_gen = state.next_generation();

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    log_engine_stdout(&text);
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        log::warn!("stderr: {}", trimmed);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let exit_code = payload.code.unwrap_or(-1);
                    log::warn!("terminated with exit code: {}", exit_code);

                    // Generation guard: if a newer engine was spawned since this
                    // monitor started, this is a stale handler — ignore silently.
                    let is_stale = app_handle
                        .try_state::<EngineState>()
                        .is_none_or(|s| !s.is_current_generation(my_gen));
                    if is_stale {
                        log::debug!("stale monitor (gen {}) ignoring termination", my_gen);
                        break;
                    }

                    // Only notify frontend of UNEXPECTED termination.
                    // Intentional stops (restart, update, relaunch) set the flag
                    // before kill() — swap(false) atomically reads and resets.
                    let was_intentional = if let Some(state) = app_handle.try_state::<EngineState>()
                    {
                        state.intentional_stop.swap(false, Ordering::SeqCst)
                    } else {
                        false
                    };

                    if !was_intentional {
                        // Any non-intentional exit is a crash — including kill -9
                        // which produces exit_code 0.  Frontend drives recovery.
                        let _ = app_handle.emit(
                            "engine-crashed",
                            serde_json::json!({
                                "code": exit_code,
                                "signal": payload.signal
                            }),
                        );
                    } else {
                        let _ = app_handle.emit("engine-stopped", ());
                    }

                    if let Some(state) = app_handle.try_state::<EngineState>() {
                        if let Ok(mut lock) = state.child.lock() {
                            if lock
                                .as_ref()
                                .map(tauri_plugin_shell::process::CommandChild::pid)
                                == Some(spawned_pid)
                            {
                                *lock = None;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Kills the running aria2c child process and releases the lock.
/// Waits briefly after kill to let the OS reclaim the process.
/// Sends a blocking `aria2.saveSession` RPC call before killing the engine.
///
/// Uses raw HTTP with a short timeout so it never blocks app exit.
/// Best-effort: failures are logged and silently ignored.
pub fn save_session_rpc(port: &str, secret: &str) {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let token = if secret.is_empty() {
        String::new()
    } else {
        format!("\"token:{}\"", secret)
    };
    let body = format!(
        r#"{{"jsonrpc":"2.0","id":"exit","method":"aria2.saveSession","params":[{}]}}"#,
        token
    );
    let request = format!(
        "POST /jsonrpc HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        port,
        body.len(),
        body
    );

    let addr = format!("127.0.0.1:{}", port);
    let timeout = std::time::Duration::from_millis(500);

    let sock_addr: std::net::SocketAddr = match addr.parse() {
        Ok(a) => a,
        Err(e) => {
            log::debug!("save_session_rpc: bad address {}: {}", addr, e);
            return;
        }
    };

    match TcpStream::connect_timeout(&sock_addr, timeout) {
        Ok(mut stream) => {
            let _ = stream.set_write_timeout(Some(timeout));
            let _ = stream.set_read_timeout(Some(timeout));
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut buf = [0u8; 256];
                let _ = stream.read(&mut buf);
                log::info!("saved aria2 session before exit");
            }
        }
        Err(e) => {
            log::debug!(
                "save_session_rpc: connect failed (engine may be down): {}",
                e
            )
        }
    }
}

pub fn stop_engine(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<EngineState>();
    // Signal intentional stop BEFORE kill so the Terminated handler
    // knows this is deliberate and suppresses engine-error.
    state.intentional_stop.store(true, Ordering::SeqCst);
    let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;

    if let Some(child) = child_lock.take() {
        let pid = child.pid();
        child
            .kill()
            .map_err(|e| format!("Failed to kill aria2c: {}", e))?;
        log::info!("stopped engine process: PID {}", pid);
        // Brief wait for the OS to fully terminate the process and release the port.
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    Ok(())
}

/// Atomically stops the current engine and starts a new one.
///
/// Holds the `EngineState` Mutex for the entire duration to prevent concurrent
/// restarts from spawning duplicate aria2c processes.  Sequence:
///   1. Kill the old child (if any) and wait for OS cleanup
///   2. Run `cleanup_port` to kill any orphaned aria2c on the RPC port
///   3. Spawn a new aria2c sidecar
///
/// This is the fix for: rapid "Save & Apply" → "Restart Engine" creating
/// orphaned aria2c processes on all platforms.
pub fn restart_engine(app: &tauri::AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let state = app.state::<EngineState>();
    // Signal intentional stop BEFORE kill so the old process's Terminated
    // handler suppresses engine-error.
    state.intentional_stop.store(true, Ordering::SeqCst);
    let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;

    // Step 1: Kill existing child if present
    if let Some(child) = child_lock.take() {
        let pid = child.pid();
        child
            .kill()
            .map_err(|e| format!("Failed to kill aria2c: {}", e))?;
        log::info!("restart: killed old engine process: PID {}", pid);
        // Wait for the OS to reclaim the process and release the port
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // Step 2: Defense-in-depth — kill any orphans still holding the port
    let port = config
        .get("rpc-listen-port")
        .and_then(|v| v.as_str())
        .unwrap_or("16800");
    cleanup_port(port);

    // Step 3: Spawn new aria2c (inlined from start_engine to keep lock held)
    if let Some(dir) = config.get("dir").and_then(|v| v.as_str()) {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create download directory '{}': {}", dir, e))?;
    }

    let conf_path = app
        .path()
        .resolve("binaries/aria2.conf", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve conf path: {}", e))?;
    let conf_str = path_to_safe_string(&conf_path);

    let session_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("download.session");
    let session_str = path_to_safe_string(&session_path);

    if let Some(parent) = session_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let args = build_start_args(
        config,
        if conf_path.exists() {
            log::info!("restart: loading engine config: {}", conf_str);
            Some(&conf_str)
        } else {
            log::warn!(
                "restart: engine config not found: {}, starting with defaults",
                conf_str
            );
            None
        },
        &session_str,
        session_path.exists(),
    );

    let sidecar = app
        .shell()
        .sidecar("motrixnext-aria2c")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(&args);

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn aria2c: {}", e))?;

    log::info!("restart: started new engine process: PID {}", child.pid());
    let spawned_pid = child.pid();
    *child_lock = Some(child);
    let my_gen = state.next_generation();

    // Reset intentional_stop for the NEW process.  This is safe because old
    // monitors are gated by generation and will never reach the swap — they
    // break immediately on stale gen check.  Without this reset, the flag
    // stays true forever and every future termination is wrongly treated as
    // intentional (suppressing crash detection AND blocking app exit).
    state.intentional_stop.store(false, Ordering::SeqCst);

    // Monitor for process termination (PID-guarded clear)
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    log_engine_stdout(&text);
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        log::warn!("stderr: {}", trimmed);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let exit_code = payload.code.unwrap_or(-1);
                    log::warn!("restart: terminated with exit code: {}", exit_code);

                    // Generation guard: stale monitor → ignore silently.
                    let is_stale = app_handle
                        .try_state::<EngineState>()
                        .is_none_or(|s| !s.is_current_generation(my_gen));
                    if is_stale {
                        log::debug!("stale monitor (gen {}) ignoring termination", my_gen);
                        break;
                    }

                    // Only notify frontend of UNEXPECTED termination.
                    let was_intentional = if let Some(state) = app_handle.try_state::<EngineState>()
                    {
                        state.intentional_stop.swap(false, Ordering::SeqCst)
                    } else {
                        false
                    };

                    if !was_intentional {
                        let _ = app_handle.emit(
                            "engine-crashed",
                            serde_json::json!({
                                "code": exit_code,
                                "signal": payload.signal
                            }),
                        );
                    } else {
                        let _ = app_handle.emit("engine-stopped", ());
                    }

                    if let Some(state) = app_handle.try_state::<EngineState>() {
                        if let Ok(mut lock) = state.child.lock() {
                            if lock
                                .as_ref()
                                .map(tauri_plugin_shell::process::CommandChild::pid)
                                == Some(spawned_pid)
                            {
                                *lock = None;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}
