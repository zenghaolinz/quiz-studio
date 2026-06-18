use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub sha256: String,
    pub relative_path: String,
    pub original_name: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub id: String,
    pub original_name: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetails {
    pub asset: AssetInfo,
    pub links: Vec<AssetLink>,
}

impl From<Asset> for AssetInfo {
    fn from(asset: Asset) -> Self {
        Self {
            id: asset.id,
            original_name: asset.original_name,
            mime_type: asset.mime_type,
            byte_size: asset.byte_size,
            created_at: asset.created_at,
        }
    }
}

#[derive(Debug, Clone)]
pub struct NewAsset {
    pub sha256: String,
    pub relative_path: String,
    pub original_name: String,
    pub mime_type: String,
    pub byte_size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetLink {
    pub id: String,
    pub asset_id: String,
    pub parent_asset_id: Option<String>,
    pub role: String,
    pub provider_id: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct NewAssetLink {
    pub asset_id: String,
    pub parent_asset_id: Option<String>,
    pub role: String,
    pub provider_id: Option<String>,
    pub model: Option<String>,
}

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
    pub source_asset_id: Option<String>,
    pub raw_asset_id: Option<String>,
    pub markdown_asset_id: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSubjectiveGradeInput {
    pub provider_id: String,
    pub question_id: String,
    pub response: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradingCriterionResult {
    pub rubric_id: Option<String>,
    pub title: String,
    pub awarded_points: f64,
    pub max_points: f64,
    pub feedback: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGradingDraft {
    pub question_id: String,
    pub suggested_score: f64,
    pub max_score: f64,
    pub feedback_markdown: String,
    pub criteria: Vec<GradingCriterionResult>,
    pub provider_id: String,
    pub model: String,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestAttempt {
    pub id: String,
    pub question_id: String,
    pub response: serde_json::Value,
    pub is_correct: Option<bool>,
    pub score: Option<f64>,
    pub answer_revealed: bool,
    pub ai_grading: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSessionSnapshot {
    pub id: String,
    pub bank_id: String,
    pub status: String,
    pub settings: serde_json::Value,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub started_at: String,
    pub submitted_at: Option<String>,
    pub attempts: Vec<TestAttempt>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTestAttemptInput {
    pub question_id: String,
    pub response: serde_json::Value,
    pub answer_revealed: bool,
    pub is_correct: Option<bool>,
    pub score: Option<f64>,
    pub ai_grading: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTestSessionInput {
    pub id: Option<String>,
    pub bank_id: String,
    pub status: String,
    pub settings: serde_json::Value,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub attempts: Vec<SaveTestAttemptInput>,
}
