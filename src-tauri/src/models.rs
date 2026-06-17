use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionBank {
    pub id: String,
    pub name: String,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub question_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuestionBankInput {
    pub name: String,
    pub subject: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub bank_id: String,
    pub parent_id: Option<String>,
    #[serde(rename = "type")]
    pub question_type: String,
    pub stem_markdown: String,
    pub options: serde_json::Value,
    pub answer: serde_json::Value,
    pub explanation_markdown: Option<String>,
    pub max_score: f64,
    pub difficulty: Option<i64>,
    pub tags: Vec<String>,
    pub source_file_id: Option<String>,
    pub source_page: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuestionInput {
    pub bank_id: String,
    #[serde(rename = "type")]
    pub question_type: String,
    pub stem_markdown: String,
    pub options: serde_json::Value,
    pub answer: serde_json::Value,
    pub explanation_markdown: Option<String>,
    pub max_score: Option<f64>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub api_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub engine: String,
    pub markdown: String,
    pub raw_json: serde_json::Value,
    pub warnings: Vec<String>,
    pub elapsed_ms: u128,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExplanationInput {
    pub provider_id: String,
    pub question_id: String,
    pub style: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExplanationResult {
    pub question: Question,
    pub provider_id: String,
    pub model: String,
    pub elapsed_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub ok: bool,
    pub message: String,
    pub elapsed_ms: u128,
}
