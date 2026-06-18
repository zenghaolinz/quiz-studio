use std::path::{Path, PathBuf};

use crate::{
    error::{command_error, AppError, AppResult},
    services::document_import::{extract_document, DocumentKind, ExtractedDocument},
};

#[tauri::command]
pub async fn extract_document_file(path: String) -> Result<ExtractedDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_document_file_blocking(path).map_err(command_error)
    })
    .await
    .map_err(|error| command_error(AppError::Runtime(error.to_string())))?
}

fn extract_document_file_blocking(path: String) -> AppResult<ExtractedDocument> {
    let path = PathBuf::from(path);
    let kind = document_kind(&path)?;
    let bytes = std::fs::read(&path)
        .map_err(|error| AppError::Io(std::io::Error::other(format!("读取文档失败: {error}"))))?;
    extract_document(&bytes, kind)
}

fn document_kind(path: &Path) -> AppResult<DocumentKind> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("docx") => Ok(DocumentKind::Docx),
        Some("pdf") => Ok(DocumentKind::Pdf),
        _ => Err(AppError::InvalidConfig("仅支持 DOCX 或 PDF 文档".into())),
    }
}
