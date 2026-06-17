use tauri::State;

use crate::{
    error::{command_error, AppError},
    models::OcrResult,
    services::glm_ocr,
    state::AppState,
};

#[tauri::command]
pub async fn run_glm_ocr(
    provider_id: String,
    image_data_url: String,
    prompt: String,
    state: State<'_, AppState>,
) -> Result<OcrResult, String> {
    let provider = state
        .database
        .get_provider_config(&provider_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("Provider {provider_id}"))))?;
    glm_ocr::run(state.inner(), &provider, &image_data_url, &prompt)
        .await
        .map_err(command_error)
}
