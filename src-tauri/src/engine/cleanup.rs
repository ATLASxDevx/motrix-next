/// Determines whether a process command name is an aria2c process.
///
/// Used by `cleanup_port` to verify that only aria2c processes are killed
/// when reclaiming the RPC port — never arbitrary processes that happen to
/// occupy the same port.
///
/// Matches both `aria2c` and `motrixnext-aria2c` (the namespaced sidecar name).
pub(crate) fn is_aria2c_process(comm: &str) -> bool {
    comm.contains("aria2c")
}

/// Kill only aria2c processes occupying the given port, so a new aria2c can bind to it.
/// Non-aria2c processes on the same port are left untouched to prevent accidental kills.
pub(crate) fn cleanup_port(port: &str) {
    #[cfg(unix)]
    {
        let output = std::process::Command::new("sh")
            .args(["-c", &format!("lsof -ti:{} 2>/dev/null", port)])
            .output();

        if let Ok(out) = output {
            let pids = String::from_utf8_lossy(&out.stdout);
            let pids = pids.trim();
            if !pids.is_empty() {
                let mut killed_any = false;
                for pid in pids.lines() {
                    let pid = pid.trim();
                    if pid.is_empty() {
                        continue;
                    }
                    // Verify the process is aria2c before killing
                    let check = std::process::Command::new("sh")
                        .args(["-c", &format!("ps -p {} -o comm= 2>/dev/null", pid)])
                        .output();
                    if let Ok(check_out) = check {
                        let comm = String::from_utf8_lossy(&check_out.stdout);
                        let comm = comm.trim();
                        if is_aria2c_process(comm) {
                            log::debug!(
                                "killing leftover aria2c process on port {}: PID {}",
                                port,
                                pid
                            );
                            let _ = std::process::Command::new("sh")
                                .args(["-c", &format!("kill -9 {} 2>/dev/null", pid)])
                                .status();
                            killed_any = true;
                        } else {
                            log::debug!(
                                "port {} occupied by non-aria2c process '{}' (PID {}), skipping",
                                port,
                                comm,
                                pid
                            );
                        }
                    }
                }
                // Brief wait for OS to release the port — only needed when we killed something
                if killed_any {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                }
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // Prevent child processes from creating visible console windows.
        // Without this flag, each cmd.exe / taskkill spawn briefly flashes
        // a CMD window on the user's desktop during startup cleanup.
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = std::process::Command::new("cmd")
            .args(["/C", &format!("netstat -ano | findstr :{}", port)])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut killed_any = false;
            for line in text.lines() {
                if let Some(pid) = line.split_whitespace().last() {
                    if pid.parse::<u32>().is_ok() {
                        // Verify the process is aria2c before killing
                        let check = std::process::Command::new("cmd")
                            .args([
                                "/C",
                                &format!("tasklist /FI \"PID eq {}\" /NH /FO CSV 2>NUL", pid),
                            ])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                        let is_aria2c = check
                            .map(|o| {
                                let s = String::from_utf8_lossy(&o.stdout);
                                s.to_lowercase().contains("aria2c")
                            })
                            .unwrap_or(false);
                        if is_aria2c {
                            log::debug!(
                                "killing leftover aria2c process on port {}: PID {}",
                                port,
                                pid
                            );
                            let _ = std::process::Command::new("taskkill")
                                .args(["/F", "/PID", pid])
                                .creation_flags(CREATE_NO_WINDOW)
                                .status();
                            killed_any = true;
                        } else {
                            log::debug!(
                                "port {} occupied by non-aria2c process (PID {}), skipping",
                                port,
                                pid
                            );
                        }
                    }
                }
            }
            // Brief wait for OS to release the port — only needed when we killed something
            if killed_any {
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_aria2c_process_matches_aria2c() {
        assert!(is_aria2c_process("aria2c"));
    }

    #[test]
    fn is_aria2c_process_matches_namespaced_sidecar() {
        assert!(is_aria2c_process("motrixnext-aria2c"));
    }

    #[test]
    fn is_aria2c_process_matches_full_path() {
        assert!(is_aria2c_process("/usr/local/bin/aria2c"));
    }

    #[test]
    fn is_aria2c_process_rejects_other_processes() {
        assert!(!is_aria2c_process("nginx"));
        assert!(!is_aria2c_process("node"));
        assert!(!is_aria2c_process("python3"));
        assert!(!is_aria2c_process(""));
    }
}
