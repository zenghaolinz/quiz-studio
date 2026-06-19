use tauri::State;

use crate::{
    error::{command_error, AppError},
    models::OcrResult,
    services::{
        local_inference::backend::{LocalInferenceBackend, LocalOcrRequest},
        ocr_artifacts,
    },
    state::AppState,
};

const DEFAULT_LOCAL_OCR_PROMPT: &str =
    "请识别文档内容并输出结构清晰的 Markdown；数学公式使用 LaTeX，表格保持行列结构。";

fn backend(state: &AppState) -> Result<&dyn LocalInferenceBackend, String> {
    state.local_inference.as_deref().ok_or_else(|| {
        command_error(AppError::Runtime(
            "packaged llama.cpp runtime is unavailable".into(),
        ))
    })
}

#[tauri::command]
pub async fn begin_local_ocr_queue(
    queue_id: String,
    model_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state
        .local_ocr_sessions
        .contains(&queue_id)
        .map_err(command_error)?
    {
        return Ok(());
    }
    let model = state
        .model_manager
        .installed_model(&model_id)
        .map_err(command_error)?;
    let lease = state
        .model_manager
        .acquire_runtime_lease(&model_id)
        .map_err(command_error)?;
    backend(state.inner())?
        .load(&model)
        .await
        .map_err(command_error)?;
    state
        .local_ocr_sessions
        .begin(&queue_id, &model_id, lease)
        .map_err(command_error)
}

#[tauri::command]
pub async fn run_local_glm_ocr(
    queue_id: String,
    task_id: String,
    image_data_url: String,
    source_name: String,
    prompt: Option<String>,
    state: State<'_, AppState>,
) -> Result<OcrResult, String> {
    let model_id = state
        .local_ocr_sessions
        .model_id(&queue_id)
        .map_err(command_error)?;
    let request = LocalOcrRequest::new(
        image_data_url.clone(),
        prompt.unwrap_or_else(|| DEFAULT_LOCAL_OCR_PROMPT.into()),
    )
    .map_err(command_error)?;
    let inference = backend(state.inner())?;
    let token = state
        .ocr_tasks
        .register(task_id.clone())
        .map_err(command_error)?;
    let response = inference.recognize(request, token).await;
    state.ocr_tasks.remove(&task_id).map_err(command_error)?;
    let response = response.map_err(command_error)?;
    let mut result = OcrResult {
        engine: "local_glm_llama_cpp".into(),
        markdown: response.markdown,
        raw_json: response.raw_json,
        warnings: Vec::new(),
        elapsed_ms: response.elapsed_ms,
        source_asset_id: None,
        raw_asset_id: None,
        markdown_asset_id: None,
    };
    match ocr_artifacts::persist_ocr_artifacts(
        &state.assets,
        &state.database,
        &image_data_url,
        &source_name,
        "local",
        &model_id,
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
pub fn finish_local_ocr_queue(
    queue_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state
        .local_ocr_sessions
        .finish(&queue_id)
        .map_err(command_error)
}

#[cfg(test)]
mod tests {
    use crate::services::local_inference::session::LocalOcrSessionRegistry;

    #[test]
    fn queue_session_keeps_a_model_lease_until_the_queue_finishes() {
        let registry = LocalOcrSessionRegistry::default();
        assert!(!registry.contains("queue-1").unwrap());
        registry.begin_for_test("queue-1", "glm-ocr-q8").unwrap();
        assert_eq!(registry.model_id("queue-1").unwrap(), "glm-ocr-q8");
        assert!(registry.contains("queue-1").unwrap());
        assert!(registry.finish("queue-1").unwrap());
        assert!(!registry.contains("queue-1").unwrap());
    }
}
