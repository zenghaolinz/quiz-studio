use serde_json::Value;
use tauri::State;

use crate::{
    error::{command_error, AppError},
    models::OcrResult,
    services::{glm_ocr, ocr_artifacts},
    state::AppState,
};

#[tauri::command]
pub async fn run_glm_ocr(
    provider_id: String,
    image_data_url: String,
    source_name: String,
    prompt: String,
    task_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<OcrResult, String> {
    let provider = state
        .database
        .get_provider_config(&provider_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("Provider {provider_id}"))))?;
    let token = if let Some(id) = task_id.as_ref() {
        Some(
            state
                .ocr_tasks
                .register(id.clone())
                .map_err(command_error)?,
        )
    } else {
        None
    };
    let run = glm_ocr::run(state.inner(), &provider, &image_data_url, &prompt);
    let run_result = if let Some(token) = token {
        tokio::select! {
            result = run => result,
            _ = token.cancelled() => Err(AppError::Runtime("OCR 任务已取消".into())),
        }
    } else {
        run.await
    };
    if let Some(id) = task_id.as_ref() {
        state.ocr_tasks.remove(id).map_err(command_error)?;
    }
    let mut result = run_result.map_err(command_error)?;
    match ocr_artifacts::persist_ocr_artifacts(
        &state.assets,
        &state.database,
        &image_data_url,
        &source_name,
        &provider.id,
        &provider.model,
        &result.raw_json,
        &result.markdown,
    ) {
        Ok(artifacts) => {
            result.source_asset_id = Some(artifacts.source_asset_id);
            result.raw_asset_id = Some(artifacts.raw_asset_id);
            result.markdown_asset_id = Some(artifacts.markdown_asset_id);
        }
        Err(error) => result
            .warnings
            .push(format!("识别成功，但本地附件保存失败：{error}")),
    }
    Ok(result)
}

#[tauri::command]
pub fn cancel_ocr_task(task_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.ocr_tasks.cancel(&task_id).map_err(command_error)
}

#[tauri::command]
pub fn persist_local_ocr_artifacts(
    source_data_url: String,
    source_name: String,
    engine: String,
    raw_json: Value,
    markdown: String,
    state: State<'_, AppState>,
) -> Result<ocr_artifacts::PersistedOcrArtifacts, String> {
    ocr_artifacts::persist_ocr_artifacts(
        &state.assets,
        &state.database,
        &source_data_url,
        &source_name,
        "local",
        &engine,
        &raw_json,
        &markdown,
    )
    .map_err(command_error)
}
