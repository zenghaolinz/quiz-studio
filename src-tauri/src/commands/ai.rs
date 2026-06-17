use tauri::State;

use crate::{
    error::{command_error, AppError},
    models::{GenerateExplanationInput, GenerateExplanationResult, ProviderTestResult},
    services::ai,
    state::AppState,
};

#[tauri::command]
pub async fn generate_question_explanation(
    input: GenerateExplanationInput,
    state: State<'_, AppState>,
) -> Result<GenerateExplanationResult, String> {
    let provider = state
        .database
        .get_provider_config(&input.provider_id)
        .map_err(command_error)?
        .ok_or_else(|| {
            command_error(AppError::NotFound(format!(
                "Provider {}",
                input.provider_id
            )))
        })?;
    let question = state
        .database
        .get_question(&input.question_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("题目 {}", input.question_id))))?;
    let generated = ai::generate_explanation(state.inner(), &provider, &question, &input.style)
        .await
        .map_err(command_error)?;
    let updated = state
        .database
        .update_question_explanation(&question.id, &generated.markdown)
        .map_err(command_error)?;
    Ok(GenerateExplanationResult {
        question: updated,
        provider_id: provider.id,
        model: provider.model,
        elapsed_ms: generated.elapsed_ms,
    })
}

#[tauri::command]
pub async fn test_ai_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<ProviderTestResult, String> {
    let provider = state
        .database
        .get_provider_config(&provider_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("Provider {provider_id}"))))?;
    ai::test_provider(state.inner(), &provider)
        .await
        .map_err(command_error)
}
