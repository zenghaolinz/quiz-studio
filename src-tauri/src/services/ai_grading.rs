use std::time::Instant;

use serde::Deserialize;

use crate::{
    error::{AppError, AppResult},
    models::{AiGradingDraft, GradingCriterionResult, ProviderConfig, Question},
    state::AppState,
};

use super::ai::{call_text_model, validate_llm_provider};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelGrade {
    suggested_score: f64,
    feedback_markdown: String,
    #[serde(default)]
    criteria: Vec<GradingCriterionResult>,
}

pub async fn generate_grade(
    state: &AppState,
    provider: &ProviderConfig,
    question: &Question,
    response: &str,
) -> AppResult<AiGradingDraft> {
    validate_llm_provider(provider)?;
    validate_request(question, response)?;
    let prompt = build_prompt(question, response)?;
    let system_prompt =
        "你是严谨的主观题评分助手。只能依据题目、参考答案和评分细则评分，并输出有效 JSON。";
    let started_at = Instant::now();
    let content = call_text_model(state, provider, system_prompt, &prompt).await?;
    let grade = parse_grade(&content, question.max_score)?;
    Ok(AiGradingDraft {
        question_id: question.id.clone(),
        suggested_score: grade.suggested_score,
        max_score: question.max_score,
        feedback_markdown: grade.feedback_markdown,
        criteria: grade.criteria,
        provider_id: provider.id.clone(),
        model: provider.model.clone(),
        elapsed_ms: started_at.elapsed().as_millis(),
        estimated_input_tokens: estimate_tokens(&format!("{system_prompt}\n{prompt}")),
        estimated_output_tokens: estimate_tokens(&content),
    })
}

fn estimate_tokens(text: &str) -> usize {
    text.chars().count().div_ceil(3).max(1)
}

fn validate_request(question: &Question, response: &str) -> AppResult<()> {
    if question
        .answer
        .get("kind")
        .and_then(serde_json::Value::as_str)
        != Some("subjective")
    {
        return Err(AppError::InvalidConfig("只有主观题可以使用 AI 评分".into()));
    }
    if response.trim().is_empty() {
        return Err(AppError::InvalidConfig("作答内容不能为空".into()));
    }
    if !question.max_score.is_finite() || question.max_score <= 0.0 {
        return Err(AppError::InvalidConfig("题目满分必须大于 0".into()));
    }
    Ok(())
}

fn build_prompt(question: &Question, response: &str) -> AppResult<String> {
    Ok(format!(
        r#"请评阅以下主观题作答。

规则：
1. 分数必须在 0 到 {max_score} 之间。
2. 按评分细则逐项给分；没有评分细则时，根据参考答案概括关键得分点。
3. 反馈应说明已做到、遗漏和改进建议，不要输出 HTML 或外部链接。
4. 只返回一个 JSON 对象，不要使用 Markdown 代码围栏：
{{
  "suggestedScore": 0,
  "feedbackMarkdown": "反馈",
  "criteria": [
    {{"rubricId": null, "title": "得分点", "awardedPoints": 0, "maxPoints": 0, "feedback": "说明"}}
  ]
}}

题目：
{stem}

参考答案与评分细则 JSON：
{answer}

考生作答：
{response}
"#,
        max_score = question.max_score,
        stem = question.stem_markdown,
        answer = serde_json::to_string_pretty(&question.answer)?,
        response = response.trim(),
    ))
}

fn parse_grade(content: &str, max_score: f64) -> AppResult<ModelGrade> {
    let cleaned = strip_code_fence(content);
    let grade: ModelGrade = serde_json::from_str(cleaned)
        .map_err(|error| AppError::Runtime(format!("模型未返回有效评分 JSON：{error}")))?;
    validate_score(grade.suggested_score, max_score, "建议分数")?;
    if grade.feedback_markdown.trim().is_empty() {
        return Err(AppError::Runtime("模型返回的评分反馈为空".into()));
    }
    for criterion in &grade.criteria {
        if !criterion.max_points.is_finite() || criterion.max_points < 0.0 {
            return Err(AppError::Runtime("模型返回了无效的评分点满分".into()));
        }
        validate_score(criterion.awarded_points, criterion.max_points, "评分点得分")?;
    }
    Ok(grade)
}

fn validate_score(score: f64, max_score: f64, label: &str) -> AppResult<()> {
    if !score.is_finite() || score < 0.0 || score > max_score {
        return Err(AppError::Runtime(format!(
            "模型返回的{label}必须在 0 到 {max_score} 之间"
        )));
    }
    Ok(())
}

fn strip_code_fence(value: &str) -> &str {
    let trimmed = value.trim();
    if !trimmed.starts_with("```") {
        return trimmed;
    }
    let body = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```JSON"))
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim_start_matches(['\r', '\n']);
    body.strip_suffix("```").unwrap_or(body).trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fenced_grade_json() {
        let grade = parse_grade(
            "```json\n{\"suggestedScore\":4,\"feedbackMarkdown\":\"不错\",\"criteria\":[]}\n```",
            5.0,
        )
        .unwrap();
        assert_eq!(grade.suggested_score, 4.0);
    }

    #[test]
    fn rejects_score_above_question_maximum() {
        let error = parse_grade(
            r#"{"suggestedScore":6,"feedbackMarkdown":"越界","criteria":[]}"#,
            5.0,
        )
        .unwrap_err();
        assert!(error.to_string().contains("0 到 5"));
    }

    #[test]
    fn rejects_invalid_criterion_score() {
        let error = parse_grade(
            r#"{"suggestedScore":4,"feedbackMarkdown":"反馈","criteria":[{"title":"要点","awardedPoints":2,"maxPoints":1,"feedback":"超分"}]}"#,
            5.0,
        )
        .unwrap_err();
        assert!(error.to_string().contains("评分点得分"));
    }

    #[test]
    fn estimates_usage_without_claiming_exact_provider_tokens() {
        assert_eq!(estimate_tokens("123456"), 2);
        assert_eq!(estimate_tokens(""), 1);
    }
}
