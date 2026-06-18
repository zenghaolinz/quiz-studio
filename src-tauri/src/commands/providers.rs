use tauri::State;

use crate::{
    error::command_error,
    models::{ProviderConfig, UpsertProviderInput},
    state::AppState,
};

#[tauri::command]
pub fn list_provider_configs(state: State<'_, AppState>) -> Result<Vec<ProviderConfig>, String> {
    state
        .database
        .list_provider_configs()
        .map_err(command_error)
}

#[tauri::command]
pub fn upsert_provider_config(
    input: UpsertProviderInput,
    state: State<'_, AppState>,
) -> Result<ProviderConfig, String> {
    let config = state
        .database
        .upsert_provider_config(&input)
        .map_err(command_error)?;
    if let Some(api_key) = input.api_key.as_deref().filter(|value| !value.is_empty()) {
        state
            .secrets
            .set(&config.id, api_key)
            .map_err(command_error)?;
    }
    Ok(config)
}

#[tauri::command]
pub fn delete_provider_config(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let deleted = state
        .database
        .delete_provider_config(&provider_id)
        .map_err(command_error)?;
    state.secrets.delete(&provider_id).map_err(command_error)?;
    Ok(deleted)
}
