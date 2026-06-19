use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::{
    error::command_error,
    services::local_inference::manager::{
        LocalModelStatus, ModelInstallPlan, ModelProgressEvent, ProgressCallback,
    },
    state::AppState,
};

const MODEL_PROGRESS_EVENT: &str = "model-download-progress";

fn progress_emitter(app: AppHandle) -> ProgressCallback {
    Arc::new(move |progress: ModelProgressEvent| {
        let _ = app.emit(MODEL_PROGRESS_EVENT, progress);
    })
}

#[tauri::command]
pub fn list_local_models(state: State<'_, AppState>) -> Result<Vec<LocalModelStatus>, String> {
    state.model_manager.list_models().map_err(command_error)
}

#[tauri::command]
pub fn plan_local_model_install(
    model_id: String,
    source: String,
    state: State<'_, AppState>,
) -> Result<ModelInstallPlan, String> {
    state
        .model_manager
        .plan_install(&model_id, &source)
        .map_err(command_error)
}

#[tauri::command]
pub async fn start_local_model_download(
    model_id: String,
    source: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state.model_manager.clone();
    manager
        .install(&model_id, &source, progress_emitter(app))
        .await
        .map_err(command_error)
}

#[tauri::command]
pub fn pause_local_model_download(
    model_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.model_manager.pause(&model_id).map_err(command_error)
}

#[tauri::command]
pub async fn resume_local_model_download(
    model_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state.model_manager.clone();
    let source = manager.resume_source(&model_id).map_err(command_error)?;
    manager
        .install(&model_id, &source, progress_emitter(app))
        .await
        .map_err(command_error)
}

#[tauri::command]
pub fn cancel_local_model_download(
    model_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.model_manager.cancel(&model_id).map_err(command_error)
}

#[tauri::command]
pub async fn verify_local_model(
    model_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let manager = state.model_manager.clone();
    tauri::async_runtime::spawn_blocking(move || manager.verify(&model_id))
        .await
        .map_err(|error| error.to_string())?
        .map_err(command_error)
}

#[tauri::command]
pub async fn repair_local_model(
    model_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state.model_manager.clone();
    let source = manager.resume_source(&model_id).map_err(command_error)?;
    manager
        .install(&model_id, &source, progress_emitter(app))
        .await
        .map_err(command_error)
}

#[tauri::command]
pub fn remove_local_model(model_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.model_manager.remove(&model_id).map_err(command_error)
}
