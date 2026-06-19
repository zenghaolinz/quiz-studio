use std::path::PathBuf;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstalledModel {
    pub id: String,
    pub model_path: PathBuf,
    pub mmproj_path: PathBuf,
}

impl InstalledModel {
    pub fn new(
        id: impl Into<String>,
        model_path: PathBuf,
        mmproj_path: PathBuf,
    ) -> AppResult<Self> {
        let id = id.into();
        if id.trim().is_empty() || model_path == mmproj_path {
            return Err(AppError::InvalidConfig("本地模型路径无效".into()));
        }
        Ok(Self {
            id,
            model_path,
            mmproj_path,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    Stopped,
    Starting,
    Ready,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeHealth {
    pub status: RuntimeStatus,
    pub model_id: Option<String>,
    pub detail: Option<String>,
}

#[derive(Clone, Debug)]
pub struct LocalOcrRequest {
    pub image_data_url: String,
    pub prompt: String,
}

impl LocalOcrRequest {
    pub fn new(image_data_url: impl Into<String>, prompt: impl Into<String>) -> AppResult<Self> {
        let image_data_url = image_data_url.into();
        let prompt = prompt.into();
        if !image_data_url.starts_with("data:image/") || prompt.trim().is_empty() {
            return Err(AppError::InvalidConfig("本地 OCR 请求无效".into()));
        }
        Ok(Self {
            image_data_url,
            prompt,
        })
    }
}

#[derive(Clone, Debug)]
pub struct LocalOcrResponse {
    pub markdown: String,
    pub raw_json: Value,
    pub elapsed_ms: u128,
}

#[async_trait]
pub trait LocalInferenceBackend: Send + Sync {
    async fn health(&self) -> AppResult<RuntimeHealth>;
    async fn load(&self, model: &InstalledModel) -> AppResult<()>;
    async fn recognize(
        &self,
        request: LocalOcrRequest,
        cancel: CancellationToken,
    ) -> AppResult<LocalOcrResponse>;
    async fn unload(&self) -> AppResult<()>;
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn installed_model_requires_distinct_existing_file_paths() {
        let same = PathBuf::from("model.gguf");
        assert!(InstalledModel::new("glm", same.clone(), same).is_err());
    }

    #[test]
    fn local_ocr_request_accepts_only_image_data_urls() {
        assert!(LocalOcrRequest::new("https://example.com/a.png", "OCR").is_err());
        assert!(LocalOcrRequest::new("data:image/png;base64,AA==", "OCR").is_ok());
    }
}
