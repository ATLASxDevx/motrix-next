use crate::error::AppError;
use crate::tray::TrayMenuState;
use serde_json::Value;
use tauri::window::ProgressBarState;
use tauri::AppHandle;
use tauri::Manager;

/// Updates the system tray title text.
///
/// Supported platforms:
/// - **macOS**: renders in the menu bar next to the tray icon
/// - **Linux**: renders as an appindicator label next to the icon
/// - **Windows**: no-op (Windows system tray has no title API)
#[tauri::command]
pub fn update_tray_title(app: AppHandle, title: String) -> Result<(), AppError> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_title(Some(&title))
            .map_err(|e| AppError::Io(e.to_string()))?;
        // Workaround: re-set icon after set_title to prevent macOS icon disappearing (Tauri/tao bug).
        // Only needed on macOS — Linux appindicator does not have this issue.
        #[cfg(target_os = "macos")]
        {
            if let Some(icon) = app.default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
            }
        }
    }
    Ok(())
}

/// Updates localized labels on tray menu items by their IDs.
#[tauri::command]
pub fn update_tray_menu_labels(app: AppHandle, labels: Value) -> Result<(), AppError> {
    let state = app.state::<TrayMenuState>();
    let items = state
        .items
        .lock()
        .map_err(|e| AppError::Store(e.to_string()))?;
    if let Some(obj) = labels.as_object() {
        for (id, text) in obj {
            if let Some(item) = items.get(id.as_str()) {
                let _ = item.set_text(text.as_str().unwrap_or(id));
            }
        }
    }
    Ok(())
}

/// Updates localized labels on application menu items by their IDs.
///
/// Recursively traverses all submenus so that items nested inside
/// submenus are found — `Menu::get()` only checks direct children.
#[tauri::command]
pub fn update_menu_labels(app: AppHandle, labels: Value) -> Result<(), AppError> {
    use tauri::menu::MenuItemKind;

    fn apply_labels(items: &[MenuItemKind<tauri::Wry>], map: &serde_json::Map<String, Value>) {
        for item in items {
            match item {
                MenuItemKind::MenuItem(mi) => {
                    if let Some(text) = map.get(mi.id().as_ref()) {
                        let _ = mi.set_text(text.as_str().unwrap_or_default());
                    }
                }
                MenuItemKind::Submenu(sub) => {
                    if let Some(text) = map.get(sub.id().as_ref()) {
                        let _ = sub.set_text(text.as_str().unwrap_or_default());
                    }
                    if let Ok(children) = sub.items() {
                        apply_labels(&children, map);
                    }
                }
                // PredefinedMenuItems have auto-generated UUIDs that cannot
                // be predicted, so we match by their current display text
                // instead (keyed by the English default in the labels map).
                MenuItemKind::Predefined(pi) => {
                    if let Ok(current) = pi.text() {
                        if let Some(new_text) = map.get(&current) {
                            let _ = pi.set_text(new_text.as_str().unwrap_or_default());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    if let Some(menu) = app.menu() {
        if let Some(obj) = labels.as_object() {
            if let Ok(items) = menu.items() {
                apply_labels(&items, obj);
            }
        }
    }
    Ok(())
}

/// Updates the taskbar/dock progress bar (0.0–1.0 for progress, negative to clear).
#[tauri::command]
pub fn update_progress_bar(app: AppHandle, progress: f64) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        if progress < 0.0 {
            let _ = window.set_progress_bar(ProgressBarState {
                status: Some(tauri::window::ProgressBarStatus::None),
                progress: None,
            });
        } else {
            let _ = window.set_progress_bar(ProgressBarState {
                status: Some(tauri::window::ProgressBarStatus::Normal),
                progress: Some((progress * 100.0) as u64),
            });
        }
    }
    Ok(())
}

/// Updates the macOS dock badge label (empty string clears the badge).
#[tauri::command]
pub fn update_dock_badge(app: AppHandle, label: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            if label.is_empty() {
                let _ = window.set_badge_label(None::<String>);
            } else {
                let _ = window.set_badge_label(Some(label));
            }
        }
    }
    let _ = app; // suppress unused warning on non-macOS
    let _ = label;
    Ok(())
}

/// Toggles the macOS Dock icon visibility at runtime.
/// When `visible` is false, reads the `hideDockOnMinimize` preference from
/// the persistent store — only hides the Dock icon if the user opted in.
/// When `visible` is true, always restores the icon (e.g. on Reopen / tray show).
/// No-op on non-macOS platforms.
#[tauri::command]
pub fn set_dock_visible(app: AppHandle, visible: bool) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        use tauri_plugin_store::StoreExt;

        if visible {
            let _ = app.set_activation_policy(ActivationPolicy::Regular);
        } else {
            let hide_dock = app
                .store("config.json")
                .ok()
                .and_then(|s| s.get("preferences"))
                .and_then(|p| p.get("hideDockOnMinimize")?.as_bool())
                .unwrap_or(false);
            if hide_dock {
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
    Ok(())
}
