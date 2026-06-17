use std::time::Instant;

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use crate::{
    error::{AppError, AppResult},
    models::{OcrResult, ProviderConfig},
    state::AppState,
};

pub async fn run(
    state: &AppState,
    provider: &ProviderConfig,
    image_data_url: &str,
    prompt: &str,
) -> AppResult<OcrResult> {
    if !provider.enabled {
        return Err(AppError::InvalidConfig("该 OCR Provider 已被禁用".into()));
    }
    if !image_data_url.starts_with("data:image/") {
        return Err(AppError::InvalidConfig("当前骨架只接受图片 data URL".into()));
    }

    let started_at = Instant::now();
    let api_key = state.secrets.get_optional(&provider.id)?;
    let raw_json = match provider.protocol.as_str() {
        "glm_sdk" => call_glm_sdk(state, provider, image_data_url, api_key.as_deref()).await?,
        "openai_compatible" => {
            call_openai_compatible(
                state,
                provider,
                image_data_url,
                prompt,
                api_key.as_deref(),
            )
            .await?
        }
        other => {
            return Err(AppError::InvalidConfig(format!(
                "不支持的 GLM-OCR 协议: {other}"
            )))
        }
    };

    let markdown = extract_markdown(&raw_json).unwrap_or_else(|| raw_json.to_string());
    let mut warnings = Vec::new();
    if markdown.trim().is_empty() {
        warnings.push("服务返回了空内容，请检查模型、图片或服务日志。".into());
    }

    Ok(OcrResult {
        engine: if provider.protocol == "openai_compatible" {
            "glm_openai_compatible".to_string()
        } else {
            "glm_sdk".to_string()
        },
        markdown,
        raw_json,
        warnings,
        elapsed_ms: started_at.elapsed().as_millis(),
    })
}

async fn call_glm_sdk(
    state: &AppState,
    provider: &ProviderConfig,
    image_data_url: &str,
    api_key: Option<&str>,
) -> AppResult<Value> {
    let endpoint = normalize_sdk_endpoint(&provider.base_url);
    let mut request = state
        .http
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "images": [image_data_url] }));
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {key}"));
    }
    let response = request.send().await?.error_for_status()?;
    Ok(response.json::<Value>().await?)
}

async fn call_openai_compatible(
    state: &AppState,
    provider: &ProviderConfig,
    image_data_url: &str,
    prompt: &str,
    api_key: Option<&str>,
) -> AppResult<Value> {
    let endpoint = normalize_openai_endpoint(&provider.base_url);
    let body = json!({
        "model": provider.model,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": prompt },
                    { "type": "image_url", "image_url": { "url": image_data_url } }
                ]
            }
        ]
    });
    let mut request = state
        .http
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&body);
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {key}"));
    }
    let response = request.send().await?.error_for_status()?;
    Ok(response.json::<Value>().await?)
}

fn normalize_sdk_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/glmocr/parse") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/glmocr/parse")
    }
}

fn normalize_openai_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn extract_markdown(value: &Value) -> Option<String> {
    const PATHS: &[&[&str]] = &[
        &["markdown"],
        &["result", "markdown"],
        &["data", "markdown"],
        &["data", "result", "markdown"],
        &["choices", "0", "message", "content"],
        &["content"],
        &["text"],
    ];

    for path in PATHS {
        if let Some(text) = read_path(value, path).and_then(Value::as_str) {
            return Some(text.to_string());
        }
    }

    value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(content_to_text)
}

fn content_to_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn read_path<'a>(root: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = root;
    for segment in path {
        current = match current {
            Value::Array(items) => items.get(segment.parse::<usize>().ok()?)?,
            Value::Object(map) => map.get(*segment)?,
            _ => return None,
        };
    }
    Some(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_openai_content() {
        let value = json!({"choices": [{"message": {"content": "# OCR"}}]});
        assert_eq!(extract_markdown(&value).as_deref(), Some("# OCR"));
    }

    #[test]
    fn normalizes_sdk_url() {
        assert_eq!(
            normalize_sdk_endpoint("http://127.0.0.1:5002"),
            "http://127.0.0.1:5002/glmocr/parse"
        );
    }
}
