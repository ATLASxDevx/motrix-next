use crate::engine;
use crate::error::AppError;
use tauri::AppHandle;

use super::config::get_system_config;

/// Starts the aria2c engine process with current system configuration.
/// Runs on a background thread to avoid blocking the WebView main thread.
#[tauri::command]
pub async fn start_engine_command(app: AppHandle) -> Result<(), AppError> {
    log::info!("engine:start-command");
    tokio::task::spawn_blocking(move || {
        let config = get_system_config(app.clone())?;
        engine::start_engine(&app, &config).map_err(AppError::Engine)
    })
    .await
    .map_err(|e| AppError::Engine(e.to_string()))?
}

/// Gracefully stops the running aria2c engine process.
/// Runs on a background thread to avoid blocking the WebView main thread.
#[tauri::command]
pub async fn stop_engine_command(app: AppHandle) -> Result<(), AppError> {
    log::info!("engine:stop-command");
    tokio::task::spawn_blocking(move || engine::stop_engine(&app).map_err(AppError::Engine))
        .await
        .map_err(|e| AppError::Engine(e.to_string()))?
}

/// Stops and restarts the aria2c engine with current system configuration.
/// Runs on a background thread to avoid blocking the WebView main thread
/// during the kill → sleep → cleanup → spawn sequence.
#[tauri::command]
pub async fn restart_engine_command(app: AppHandle) -> Result<(), AppError> {
    log::info!("engine:restart-command");
    tokio::task::spawn_blocking(move || {
        let config = get_system_config(app.clone())?;
        engine::restart_engine(&app, &config).map_err(AppError::Engine)
    })
    .await
    .map_err(|e| AppError::Engine(e.to_string()))?
}
