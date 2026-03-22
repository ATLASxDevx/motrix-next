use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Holds references to tray menu items for dynamic label updates (i18n).
/// Used by the `update_tray_menu_labels` command to set localized text
/// at runtime without rebuilding the menu.
pub struct TrayMenuState {
    pub items: Mutex<HashMap<String, MenuItem<tauri::Wry>>>,
}

/// Returns the existing main window, or recreates it if it was destroyed.
///
/// On Linux/Wayland + `decorations: false`, the compositor can destroy
/// the window without emitting `CloseRequested`.  When the user later
/// clicks the tray icon or triggers macOS Reopen, the original window
/// handle is gone.  This function detects that and rebuilds the window
/// using the same config as `tauri.conf.json`.
///
/// The newly created window is visible by default — the caller can
/// `.show()` + `.set_focus()` as usual.
pub fn get_or_create_main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window("main") {
        return Some(window);
    }

    // Window was destroyed — recreate from config.
    log::warn!("tray:window-not-found label=main — recreating after compositor force-close");

    match WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Motrix Next")
        .inner_size(1068.0, 680.0)
        .min_inner_size(970.0, 560.0)
        .transparent(true)
        .decorations(false)
        .center()
        .visible(false)
        .build()
    {
        Ok(w) => {
            log::info!("tray:window-recreated label=main");
            Some(w)
        }
        Err(e) => {
            log::error!("tray:window-recreate-failed error={}", e);
            None
        }
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<TrayMenuState, Box<dyn std::error::Error>> {
    // Create MenuItem references for TrayMenuState (used by update_tray_menu_labels).
    // All three platforms use the same native menu — no platform-specific branching.
    let show_item = MenuItem::with_id(app, "show", "Show Motrix Next", true, None::<&str>)?;
    let new_task_item = MenuItem::with_id(app, "tray-new-task", "New Task", true, None::<&str>)?;
    let resume_all_item =
        MenuItem::with_id(app, "tray-resume-all", "Resume All", true, None::<&str>)?;
    let pause_all_item = MenuItem::with_id(app, "tray-pause-all", "Pause All", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;

    // Clone items before moving into the HashMap — the menu needs the originals,
    // while the HashMap is used for dynamic label updates.
    let mut items_map: HashMap<String, MenuItem<tauri::Wry>> = HashMap::new();
    items_map.insert("show".to_string(), show_item.clone());
    items_map.insert("tray-new-task".to_string(), new_task_item.clone());
    items_map.insert("tray-resume-all".to_string(), resume_all_item.clone());
    items_map.insert("tray-pause-all".to_string(), pause_all_item.clone());
    items_map.insert("tray-quit".to_string(), quit_item.clone());

    // Build the native OS menu — unified for macOS, Windows, and Linux.
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &PredefinedMenuItem::separator(app)?,
            &new_task_item,
            &resume_all_item,
            &pause_all_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/tray-icon.png"
        ))?)
        .on_tray_icon_event(|tray, event| {
            // Left-click: show main window (macOS and Windows).
            // Linux libappindicator does not emit TrayIconEvent::Click —
            // the "Show" menu item serves as the equivalent on Linux.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                log::info!("tray:left-click — showing main window");
                #[cfg(target_os = "macos")]
                {
                    use tauri::ActivationPolicy;
                    let _ = app.set_activation_policy(ActivationPolicy::Regular);
                }
                if let Some(window) = get_or_create_main_window(app) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => {
                    log::info!("tray:menu-show — showing main window");
                    #[cfg(target_os = "macos")]
                    {
                        use tauri::ActivationPolicy;
                        let _ = app.set_activation_policy(ActivationPolicy::Regular);
                    }
                    if let Some(window) = get_or_create_main_window(app) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {
                    if let Some(action) = resolve_tray_action(id) {
                        let _ = app.emit("tray-menu-action", action);
                    }
                }
            }
        })
        .build(app)?;

    Ok(TrayMenuState {
        items: Mutex::new(items_map),
    })
}

/// Maps a tray menu event ID to the action string emitted to the frontend.
///
/// Returns `None` for the "show" action (handled natively, not forwarded)
/// and for unknown IDs.
///
/// This is a pure function extracted from the `on_menu_event` closure
/// so it can be unit-tested without a Tauri runtime.
pub fn resolve_tray_action(menu_id: &str) -> Option<&str> {
    match menu_id {
        "tray-new-task" | "tray-resume-all" | "tray-pause-all" => {
            Some(menu_id.strip_prefix("tray-").unwrap_or(menu_id))
        }
        "tray-quit" => Some("quit"),
        // "show" is handled natively (window.show + set_focus), not emitted
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_new_task() {
        assert_eq!(resolve_tray_action("tray-new-task"), Some("new-task"));
    }

    #[test]
    fn resolve_resume_all() {
        assert_eq!(resolve_tray_action("tray-resume-all"), Some("resume-all"));
    }

    #[test]
    fn resolve_pause_all() {
        assert_eq!(resolve_tray_action("tray-pause-all"), Some("pause-all"));
    }

    #[test]
    fn resolve_quit() {
        assert_eq!(resolve_tray_action("tray-quit"), Some("quit"));
    }

    #[test]
    fn resolve_show_returns_none() {
        // "show" is handled natively, not emitted to frontend
        assert_eq!(resolve_tray_action("show"), None);
    }

    #[test]
    fn resolve_unknown_returns_none() {
        assert_eq!(resolve_tray_action("nonexistent"), None);
    }
}
