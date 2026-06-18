use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{ProviderConfig, UpsertProviderInput},
};

use super::Database;

impl Database {
    pub fn list_provider_configs(&self) -> AppResult<Vec<ProviderConfig>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, name, kind, protocol, base_url, model, enabled, created_at, updated_at
             FROM provider_configs ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ProviderConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                protocol: row.get(3)?,
                base_url: row.get(4)?,
                model: row.get(5)?,
                enabled: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn upsert_provider_config(&self, input: &UpsertProviderInput) -> AppResult<ProviderConfig> {
        validate_provider(input)?;
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();
        {
            let connection = self.connection()?;
            connection.execute(
                "INSERT INTO provider_configs (
                    id, name, kind, protocol, base_url, model, enabled, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    kind = excluded.kind,
                    protocol = excluded.protocol,
                    base_url = excluded.base_url,
                    model = excluded.model,
                    enabled = excluded.enabled,
                    updated_at = excluded.updated_at",
                params![
                    id,
                    input.name.trim(),
                    input.kind,
                    input.protocol,
                    input.base_url.trim(),
                    input.model.trim(),
                    if input.enabled { 1 } else { 0 },
                    now,
                ],
            )?;
        }
        self.get_provider_config(&id)?
            .ok_or_else(|| AppError::NotFound(id))
    }

    pub fn get_provider_config(&self, id: &str) -> AppResult<Option<ProviderConfig>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT id, name, kind, protocol, base_url, model, enabled, created_at, updated_at
                 FROM provider_configs WHERE id = ?1",
                [id],
                |row| {
                    Ok(ProviderConfig {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        kind: row.get(2)?,
                        protocol: row.get(3)?,
                        base_url: row.get(4)?,
                        model: row.get(5)?,
                        enabled: row.get::<_, i64>(6)? != 0,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn delete_provider_config(&self, id: &str) -> AppResult<bool> {
        let connection = self.connection()?;
        Ok(connection.execute("DELETE FROM provider_configs WHERE id = ?1", [id])? > 0)
    }
}

fn validate_provider(input: &UpsertProviderInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::InvalidConfig("Provider 名称不能为空".into()));
    }
    if !matches!(
        input.protocol.as_str(),
        "glm_sdk" | "openai_compatible" | "anthropic_messages"
    ) {
        return Err(AppError::InvalidConfig("不支持的 Provider 协议".into()));
    }
    if !matches!(input.kind.as_str(), "ocr" | "llm") {
        return Err(AppError::InvalidConfig(
            "Provider 类型只能是 ocr 或 llm".into(),
        ));
    }
    if input.kind == "llm" && input.protocol == "glm_sdk" {
        return Err(AppError::InvalidConfig(
            "语言模型 Provider 不能使用 glm_sdk OCR 协议".into(),
        ));
    }
    if input.kind == "ocr" && input.protocol == "anthropic_messages" {
        return Err(AppError::InvalidConfig(
            "OCR Provider 不能使用 Anthropic Messages 协议".into(),
        ));
    }
    let parsed = url::Url::parse(input.base_url.trim())
        .map_err(|_| AppError::InvalidConfig("服务地址不是有效 URL".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidConfig(
            "服务地址只允许 HTTP 或 HTTPS".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_returns_the_saved_provider_without_blocking() {
        let path =
            std::env::temp_dir().join(format!("quiz-studio-provider-{}.sqlite3", Uuid::new_v4()));
        let database = Database::open(&path).unwrap();
        let saved = database
            .upsert_provider_config(&UpsertProviderInput {
                id: Some("llm-test".into()),
                name: "Test LLM".into(),
                kind: "llm".into(),
                protocol: "openai_compatible".into(),
                base_url: "https://api.example.com/v1".into(),
                model: "test-model".into(),
                enabled: true,
                api_key: None,
            })
            .unwrap();

        assert_eq!(saved.id, "llm-test");
        assert_eq!(saved.model, "test-model");
    }

    #[test]
    fn deletes_provider_config() {
        let path = std::env::temp_dir().join(format!(
            "quiz-studio-provider-delete-{}.sqlite3",
            Uuid::new_v4()
        ));
        let database = Database::open(&path).unwrap();
        database
            .upsert_provider_config(&UpsertProviderInput {
                id: Some("llm-delete-me".into()),
                name: "Disposable LLM".into(),
                kind: "llm".into(),
                protocol: "openai_compatible".into(),
                base_url: "https://api.example.com/v1".into(),
                model: "test-model".into(),
                enabled: true,
                api_key: None,
            })
            .unwrap();

        assert!(database.delete_provider_config("llm-delete-me").unwrap());
        assert!(database
            .get_provider_config("llm-delete-me")
            .unwrap()
            .is_none());
        assert!(!database.delete_provider_config("llm-delete-me").unwrap());
    }
}
