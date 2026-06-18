use std::time::Instant;

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use crate::{
    error::{AppError, AppResult},
    models::{ProviderConfig, ProviderTestResult, Question},
    state::AppState,
};

pub struct GeneratedExplanation {
    pub markdown: String,
    pub elapsed_ms: u128,
}

pub async fn generate_explanation(
    state: &AppState,
    provider: &ProviderConfig,
    question: &Question,
    style: &str,
) -> AppResult<GeneratedExplanation> {
    validate_llm_provider(provider)?;
    let prompt = build_explanation_prompt(question, style)?;
    let started_at = Instant::now();
    let content = call_text_model(
        state,
        provider,
        "你负责为题库生成准确、可教学、格式规范的解析。",
        &prompt,
    )
    .await?;
    let markdown = parse_explanation_content(&content)?;
    Ok(GeneratedExplanation {
        markdown,
        elapsed_ms: started_at.elapsed().as_millis(),
    })
}

pub async fn test_provider(
    state: &AppState,
    provider: &ProviderConfig,
) -> AppResult<ProviderTestResult> {
    validate_llm_provider(provider)?;
    let started_at = Instant::now();
    let response = call_text_model(
        state,
        provider,
        "你是一个连接测试助手。",
        "这是一次连接测试。请只回复：连接成功",
    )
    .await?;
    let message = response.trim();
    Ok(ProviderTestResult {
        ok: true,
        message: if message.is_empty() {
            "服务已响应，但返回内容为空。".to_string()
        } else {
            truncate(message, 160)
        },
        elapsed_ms: started_at.elapsed().as_millis(),
    })
}

pub(crate) fn validate_llm_provider(provider: &ProviderConfig) -> AppResult<()> {
    if provider.kind != "llm" {
        return Err(AppError::InvalidConfig(
            "选择的 Provider 不是语言模型配置".into(),
        ));
    }
    if !provider.enabled {
        return Err(AppError::InvalidConfig(
            "该语言模型 Provider 已被禁用".into(),
        ));
    }
    if provider.model.trim().is_empty() {
        return Err(AppError::InvalidConfig("模型名称不能为空".into()));
    }
    if !matches!(
        provider.protocol.as_str(),
        "openai_compatible" | "anthropic_messages"
    ) {
        return Err(AppError::InvalidConfig(format!(
            "AI 解析暂不支持协议 {}",
            provider.protocol
        )));
    }
    Ok(())
}

fn build_explanation_prompt(question: &Question, style: &str) -> AppResult<String> {
    let style_instruction = match style {
        "concise" => "解析应简洁，突出考点与判断依据，通常控制在 150～300 字。",
        "step_by_step" => "解析应分步骤推导；计算题必须展示关键步骤和结论。",
        "detailed" => "解析应详细说明考点、正确答案依据，并分析易错点。",
        other => {
            return Err(AppError::InvalidConfig(format!(
                "不支持的解析风格: {other}"
            )))
        }
    };
    let options = serde_json::to_string_pretty(&question.options)?;
    let answer = serde_json::to_string_pretty(&question.answer)?;
    Ok(format!(
        r#"你是严谨的题库解析编写助手。请根据题目和已知标准答案生成教学解析。

要求：
1. 不得质疑或修改给出的标准答案；如果题目本身疑似有问题，在解析末尾用“> 注意：”指出。
2. {style_instruction}
3. 数学公式使用 LaTeX：行内 `$...$`，独立公式 `$$...$$`。
4. 化学式和化学方程式使用 mhchem，例如 `$\ce{{H2O}}$`、`$\ce{{2H2 + O2 -> 2H2O}}$`。
5. 不要输出 HTML、脚本、iframe 或外部链接。
6. 只返回一个 JSON 对象，不要使用 Markdown 代码围栏。格式：
{{
  "analysisMarkdown": "可直接渲染的 Markdown 解析",
  "knowledgePoints": ["知识点1", "知识点2"]
}}

题型：{question_type}
题干：
{stem}

选项 JSON：
{options}

标准答案 JSON：
{answer}
"#,
        style_instruction = style_instruction,
        question_type = question.question_type,
        stem = question.stem_markdown,
        options = options,
        answer = answer,
    ))
}

pub(crate) async fn call_text_model(
    state: &AppState,
    provider: &ProviderConfig,
    system_prompt: &str,
    prompt: &str,
) -> AppResult<String> {
    let api_key = state.secrets.get_optional(&provider.id)?;
    match provider.protocol.as_str() {
        "openai_compatible" => {
            call_openai_compatible(state, provider, system_prompt, prompt, api_key.as_deref()).await
        }
        "anthropic_messages" => {
            call_anthropic_messages(state, provider, system_prompt, prompt, api_key.as_deref())
                .await
        }
        other => Err(AppError::InvalidConfig(format!(
            "不支持的语言模型协议: {other}"
        ))),
    }
}

async fn call_openai_compatible(
    state: &AppState,
    provider: &ProviderConfig,
    system_prompt: &str,
    prompt: &str,
    api_key: Option<&str>,
) -> AppResult<String> {
    let endpoint = normalize_endpoint(&provider.base_url, "chat/completions");
    let body = json!({
        "model": provider.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
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
    let value = send_json(request).await?;
    extract_openai_text(&value).ok_or_else(|| {
        AppError::Runtime(format!(
            "模型响应中没有可识别的文本内容: {}",
            truncate(&value.to_string(), 300)
        ))
    })
}

async fn call_anthropic_messages(
    state: &AppState,
    provider: &ProviderConfig,
    system_prompt: &str,
    prompt: &str,
    api_key: Option<&str>,
) -> AppResult<String> {
    let key = api_key
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::InvalidConfig("Anthropic Provider 缺少 API Key".into()))?;
    let endpoint = normalize_endpoint(&provider.base_url, "messages");
    let body = json!({
        "model": provider.model,
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [{ "role": "user", "content": prompt }]
    });
    let request = state
        .http
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body);
    let value = send_json(request).await?;
    extract_anthropic_text(&value).ok_or_else(|| {
        AppError::Runtime(format!(
            "Anthropic 响应中没有可识别的文本内容: {}",
            truncate(&value.to_string(), 300)
        ))
    })
}

async fn send_json(request: reqwest::RequestBuilder) -> AppResult<Value> {
    let response = request.send().await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(AppError::Runtime(format!(
            "模型服务返回 HTTP {}：{}",
            status.as_u16(),
            truncate(&body, 500)
        )));
    }
    serde_json::from_str(&body).map_err(|error| {
        AppError::Runtime(format!(
            "模型服务未返回有效 JSON（{}）：{}",
            error,
            truncate(&body, 500)
        ))
    })
}

fn normalize_endpoint(base_url: &str, suffix: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with(suffix) {
        trimmed.to_string()
    } else {
        format!("{trimmed}/{suffix}")
    }
}

fn extract_openai_text(value: &Value) -> Option<String> {
    value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")
        .and_then(content_to_text)
        .or_else(|| {
            value
                .get("output_text")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn extract_anthropic_text(value: &Value) -> Option<String> {
    let text = value
        .get("content")?
        .as_array()?
        .iter()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    (!text.trim().is_empty()).then_some(text)
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
            (!text.trim().is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn parse_explanation_content(content: &str) -> AppResult<String> {
    let cleaned = strip_code_fence(content).trim();
    if cleaned.is_empty() {
        return Err(AppError::Runtime("模型返回了空解析".into()));
    }
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        for key in [
            "analysisMarkdown",
            "explanationMarkdown",
            "analysis",
            "explanation",
        ] {
            if let Some(text) = value.get(key).and_then(Value::as_str) {
                let text = text.trim();
                if !text.is_empty() {
                    return Ok(text.to_string());
                }
            }
        }
    }
    Ok(cleaned.to_string())
}

fn strip_code_fence(value: &str) -> &str {
    let trimmed = value.trim();
    if !trimmed.starts_with("```") {
        return trimmed;
    }
    let without_open = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```JSON"))
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim_start_matches(|character| character == '\r' || character == '\n');
    without_open
        .strip_suffix("```")
        .unwrap_or(without_open)
        .trim()
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let prefix = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_json_markdown() {
        let content = r#"{"analysisMarkdown":"答案是 $x=1$。","knowledgePoints":[]}"#;
        assert_eq!(
            parse_explanation_content(content).unwrap(),
            "答案是 $x=1$。"
        );
    }
    #[test]
    fn accepts_fenced_json() {
        assert_eq!(
            parse_explanation_content("```json\n{\"analysisMarkdown\":\"解析\"}\n```").unwrap(),
            "解析"
        );
    }
    #[test]
    fn normalizes_openai_endpoint() {
        assert_eq!(
            normalize_endpoint("https://api.example.com/v1/", "chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }
}
