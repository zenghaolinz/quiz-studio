use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::{
    error::{command_error, AppError},
    models::{AssetDetails, AssetInfo, NewAssetLink},
    state::AppState,
};

#[tauri::command]
pub fn import_asset(
    data_url: String,
    original_name: String,
    state: State<'_, AppState>,
) -> Result<AssetInfo, String> {
    let asset = state
        .assets
        .put_data_url(&state.database, &data_url, &original_name)
        .map_err(command_error)?;
    state
        .database
        .insert_asset_link(&NewAssetLink {
            asset_id: asset.id.clone(),
            parent_asset_id: None,
            role: "source".into(),
            provider_id: None,
            model: None,
        })
        .map_err(command_error)?;
    Ok(asset.into())
}

#[tauri::command]
pub fn get_asset_info(asset_id: String, state: State<'_, AppState>) -> Result<AssetInfo, String> {
    state
        .database
        .get_asset(&asset_id)
        .map_err(command_error)?
        .map(Into::into)
        .ok_or_else(|| command_error(AppError::NotFound(format!("附件 {asset_id}"))))
}

#[tauri::command]
pub fn get_asset_details(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<AssetDetails, String> {
    let asset = state
        .database
        .get_asset(&asset_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("附件 {asset_id}"))))?;
    let links = state
        .database
        .list_asset_links(&asset_id)
        .map_err(command_error)?;
    Ok(AssetDetails {
        asset: asset.into(),
        links,
    })
}

#[tauri::command]
pub fn read_text_asset(asset_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let asset = state
        .database
        .get_asset(&asset_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("附件 {asset_id}"))))?;
    if !matches!(
        asset.mime_type.as_str(),
        "text/plain" | "text/markdown" | "application/json"
    ) {
        return Err(command_error(AppError::InvalidConfig(
            "只能以文本形式读取文本、Markdown 或 JSON 附件".into(),
        )));
    }
    let bytes = state
        .assets
        .read(&state.database, &asset_id)
        .map_err(command_error)?;
    String::from_utf8(bytes)
        .map_err(|_| command_error(AppError::Runtime("附件不是有效的 UTF-8 文本".into())))
}

#[tauri::command]
pub fn get_asset_data_url(asset_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let asset = state
        .database
        .get_asset(&asset_id)
        .map_err(command_error)?
        .ok_or_else(|| command_error(AppError::NotFound(format!("附件 {asset_id}"))))?;
    let bytes = state
        .assets
        .read(&state.database, &asset_id)
        .map_err(command_error)?;
    Ok(format!(
        "data:{};base64,{}",
        asset.mime_type,
        STANDARD.encode(bytes)
    ))
}
