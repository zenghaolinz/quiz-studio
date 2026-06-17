use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        CreateQuestionBankInput, CreateQuestionInput, ProviderConfig, Question, QuestionBank,
        UpsertProviderInput,
    },
};

const INIT_SQL: &str = include_str!("schema.sql");

/// 内部连接包在 Arc 中，因此 Database 可被廉价克隆，
/// 供 async 命令在 spawn_blocking 线程中持有独立句柄操作数据库。
#[derive(Clone)]
pub struct Database {
    connection: Arc<Mutex<Connection>>,
}

impl Database {
    /// 返回底层连接的 Arc 句柄，供 async 命令把数据库操作丢到 spawn_blocking 线程执行。
    pub fn clone_ref(&self) -> Database {
        self.clone()
    }

    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.execute_batch(INIT_SQL)?;
        Self::migrate(&connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    /// 受控迁移：读 schema_version，按需应用尚未执行的迁移。
    /// 首次建库时 execute_batch 已建好全部表，这里把 version=1 标记为已应用。
    /// 后续新增迁移在此追加 `apply_migration(&conn, N, "ALTER ...")`。
    fn migrate(connection: &Connection) -> AppResult<()> {
        let current: Option<i64> = connection
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get(0)
            })
            .ok()
            .flatten();

        // version 1 = 初始 schema（由 INIT_SQL 建表）。若未记录则补记。
        if current.unwrap_or(0) < 1 {
            let now = Utc::now().to_rfc3339();
            connection.execute(
                "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, ?1)",
                params![now],
            )?;
        }
        // 后续迁移示例（当前无）：
        // apply_migration(connection, 2, "ALTER TABLE ... ADD COLUMN ...")?;
        Ok(())
    }

    fn connection(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.connection.lock().map_err(|_| AppError::PoisonedLock)
    }

    pub fn list_question_banks(&self) -> AppResult<Vec<QuestionBank>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT b.id, b.name, b.subject, b.description, COUNT(q.id), b.created_at, b.updated_at
             FROM question_banks b
             LEFT JOIN questions q ON q.bank_id = b.id
             GROUP BY b.id
             ORDER BY b.updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(QuestionBank {
                id: row.get(0)?,
                name: row.get(1)?,
                subject: row.get(2)?,
                description: row.get(3)?,
                question_count: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn create_question_bank(&self, input: CreateQuestionBankInput) -> AppResult<QuestionBank> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidConfig("题库名称不能为空".into()));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO question_banks (id, name, subject, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id, name, input.subject, input.description, now],
        )?;
        Ok(QuestionBank {
            id,
            name: name.to_string(),
            subject: input.subject,
            description: input.description,
            question_count: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn list_questions(&self, bank_id: &str) -> AppResult<Vec<Question>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, bank_id, parent_id, type, stem_markdown, options_json, answer_json,
                    explanation_markdown, max_score, difficulty, tags_json, source_file_id,
                    source_page, created_at, updated_at
             FROM questions WHERE bank_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([bank_id], map_question_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_question(&self, id: &str) -> AppResult<Option<Question>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT id, bank_id, parent_id, type, stem_markdown, options_json, answer_json,
                        explanation_markdown, max_score, difficulty, tags_json, source_file_id,
                        source_page, created_at, updated_at
                 FROM questions WHERE id = ?1",
                [id],
                map_question_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn update_question_explanation(&self, id: &str, markdown: &str) -> AppResult<Question> {
        let explanation = markdown.trim();
        if explanation.is_empty() {
            return Err(AppError::InvalidConfig("解析内容不能为空".into()));
        }
        let now = Utc::now().to_rfc3339();
        {
            let connection = self.connection()?;
            let bank_id: Option<String> = connection
                .query_row("SELECT bank_id FROM questions WHERE id = ?1", [id], |row| {
                    row.get(0)
                })
                .optional()?;
            let bank_id =
                bank_id.ok_or_else(|| AppError::NotFound(format!("题目 {} 不存在", id)))?;
            connection.execute(
                "UPDATE questions SET explanation_markdown = ?1, updated_at = ?2 WHERE id = ?3",
                params![explanation, now, id],
            )?;
            connection.execute(
                "UPDATE question_banks SET updated_at = ?1 WHERE id = ?2",
                params![now, bank_id],
            )?;
        }
        self.get_question(id)?
            .ok_or_else(|| AppError::NotFound(format!("题目 {} 不存在", id)))
    }

    pub fn create_question(&self, input: CreateQuestionInput) -> AppResult<Question> {
        let mut connection = self.connection()?;
        let now = Utc::now().to_rfc3339();
        // 复用事务内实现：单条也算一个事务，行为与原来一致
        let result = connection.transaction()?;
        let question = insert_question_tx(&result, &input, &now)?;
        result.execute(
            "UPDATE question_banks SET updated_at = ?1 WHERE id = ?2",
            params![now, input.bank_id],
        )?;
        result.commit()?;
        Ok(question)
    }

    /// 批量导入：单一事务，任一失败回滚整批（导入失败不留半套题库）。
    /// bank 存在性在事务开头校验一次。返回成功写入的题数。
    pub fn create_questions_batch(
        &self,
        bank_id: &str,
        inputs: &[CreateQuestionInput],
    ) -> AppResult<usize> {
        if inputs.is_empty() {
            return Err(AppError::InvalidConfig("没有可导入的题目".into()));
        }
        let mut connection = self.connection()?;
        let now = Utc::now().to_rfc3339();
        let tx = connection.transaction()?;

        let bank_exists: bool = tx
            .query_row(
                "SELECT 1 FROM question_banks WHERE id = ?1",
                [bank_id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !bank_exists {
            return Err(AppError::NotFound(format!("题库 {} 不存在", bank_id)));
        }

        // 校验 bank_id 一致：所有题目都要落入目标题库
        for (i, input) in inputs.iter().enumerate() {
            if input.bank_id != bank_id {
                return Err(AppError::InvalidConfig(format!(
                    "第 {} 题的 bank_id 与目标题库不一致",
                    i + 1
                )));
            }
        }

        let mut count = 0usize;
        for input in inputs {
            insert_question_tx(&tx, input, &now)?;
            count += 1;
        }
        tx.execute(
            "UPDATE question_banks SET updated_at = ?1 WHERE id = ?2",
            params![now, bank_id],
        )?;
        tx.commit()?;
        Ok(count)
    }

    pub fn delete_question(&self, id: &str) -> AppResult<()> {
        let connection = self.connection()?;
        let affected = connection.execute("DELETE FROM questions WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("题目 {} 不存在", id)));
        }
        Ok(())
    }

    pub fn delete_question_bank(&self, id: &str) -> AppResult<()> {
        let connection = self.connection()?;
        let affected =
            connection.execute("DELETE FROM question_banks WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("题库 {} 不存在", id)));
        }
        // questions 通过 ON DELETE CASCADE 自动清理（外键已启用）
        Ok(())
    }

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
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        validate_provider(input)?;
        let now = Utc::now().to_rfc3339();
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
}

/// 在给定事务/连接上插入一道题。create_question 与 create_questions_batch 共用。
/// 不负责更新 question_banks.updated_at（由调用方统一处理），以便批量只更新一次。
fn insert_question_tx(
    conn: &Connection,
    input: &CreateQuestionInput,
    now: &str,
) -> AppResult<Question> {
    let id = Uuid::new_v4().to_string();
    let max_score = input.max_score.unwrap_or(1.0);
    let tags = input.tags.clone().unwrap_or_default();
    let options_json = serde_json::to_string(&input.options)?;
    let answer_json = serde_json::to_string(&input.answer)?;
    let tags_json = serde_json::to_string(&tags)?;
    conn.execute(
        "INSERT INTO questions (
            id, bank_id, type, stem_markdown, options_json, answer_json,
            explanation_markdown, max_score, tags_json, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            id,
            input.bank_id,
            input.question_type,
            input.stem_markdown,
            options_json,
            answer_json,
            input.explanation_markdown,
            max_score,
            tags_json,
            now,
        ],
    )?;
    Ok(Question {
        id,
        bank_id: input.bank_id.clone(),
        parent_id: None,
        question_type: input.question_type.clone(),
        stem_markdown: input.stem_markdown.clone(),
        options: input.options.clone(),
        answer: input.answer.clone(),
        explanation_markdown: input.explanation_markdown.clone(),
        max_score,
        difficulty: None,
        tags,
        source_file_id: None,
        source_page: None,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    })
}

fn map_question_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Question> {
    let options_json: String = row.get(5)?;
    let answer_json: String = row.get(6)?;
    let tags_json: String = row.get(10)?;
    Ok(Question {
        id: row.get(0)?,
        bank_id: row.get(1)?,
        parent_id: row.get(2)?,
        question_type: row.get(3)?,
        stem_markdown: row.get(4)?,
        options: serde_json::from_str(&options_json).unwrap_or(serde_json::Value::Array(vec![])),
        answer: serde_json::from_str(&answer_json).unwrap_or(serde_json::Value::Null),
        explanation_markdown: row.get(7)?,
        max_score: row.get(8)?,
        difficulty: row.get(9)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        source_file_id: row.get(11)?,
        source_page: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
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
    use std::env;

    fn temp_db() -> Database {
        let mut path = env::temp_dir();
        path.push(format!(
            "quiz-studio-smoke-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        Database::open(&path).expect("database should open and migrate")
    }

    #[test]
    fn create_then_list_question_bank() {
        let db = temp_db();
        assert_eq!(db.list_question_banks().unwrap().len(), 0);

        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "  smoke 题库  ".into(),
                subject: Some("验证".into()),
                description: None,
            })
            .unwrap();

        // name is trimmed on write; round-trips through list
        assert_eq!(bank.name, "smoke 题库");
        let listed = db.list_question_banks().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, bank.id);
        assert_eq!(listed[0].name, "smoke 题库");
    }

    #[test]
    fn rejects_empty_bank_name() {
        let db = temp_db();
        let result = db.create_question_bank(CreateQuestionBankInput {
            name: "   ".into(),
            subject: None,
            description: None,
        });
        assert!(matches!(result, Err(AppError::InvalidConfig(_))));
    }

    fn sample_question_input(bank_id: &str, stem: &str) -> CreateQuestionInput {
        CreateQuestionInput {
            bank_id: bank_id.into(),
            question_type: "single_choice".into(),
            stem_markdown: stem.into(),
            options: serde_json::json!([
                { "id": "a", "label": "A", "contentMarkdown": "x" },
                { "id": "b", "label": "B", "contentMarkdown": "y" }
            ]),
            answer: serde_json::json!({ "kind": "choice", "optionIds": ["b"] }),
            explanation_markdown: Some("解析".into()),
            max_score: Some(1.0),
            tags: Some(vec!["t".into()]),
        }
    }

    #[test]
    fn batch_insert_then_list_and_delete() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "batch".into(),
                subject: None,
                description: None,
            })
            .unwrap();

        let inputs = vec![
            sample_question_input(&bank.id, "题1"),
            sample_question_input(&bank.id, "题2"),
            sample_question_input(&bank.id, "题3"),
        ];
        let count = db.create_questions_batch(&bank.id, &inputs).unwrap();
        assert_eq!(count, 3);
        let qs = db.list_questions(&bank.id).unwrap();
        assert_eq!(qs.len(), 3);

        // 删一道
        db.delete_question(&qs[0].id).unwrap();
        assert_eq!(db.list_questions(&bank.id).unwrap().len(), 2);
        // 删不存在
        assert!(matches!(
            db.delete_question("nope"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn batch_insert_is_atomic_on_bank_mismatch() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "atomic".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        // 第二题 bank_id 指向不存在的库 → 整批回滚
        let mut bad = sample_question_input(&bank.id, "题1");
        bad.bank_id = "missing-bank".into();
        let inputs = vec![sample_question_input(&bank.id, "题1"), bad];
        let result = db.create_questions_batch(&bank.id, &inputs);
        assert!(result.is_err());
        // 回滚后库里无残留
        assert_eq!(db.list_questions(&bank.id).unwrap().len(), 0);
    }

    #[test]
    fn delete_bank_cascades_questions() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "cascade".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        db.create_questions_batch(&bank.id, &[sample_question_input(&bank.id, "题1")])
            .unwrap();
        assert_eq!(db.list_questions(&bank.id).unwrap().len(), 1);
        db.delete_question_bank(&bank.id).unwrap();
        // 题库没了，题也跟着没了
        assert!(db.list_questions(&bank.id).is_ok());
        assert_eq!(db.list_questions(&bank.id).unwrap().len(), 0);
        assert_eq!(db.list_question_banks().unwrap().len(), 0);
    }

    #[test]
    fn updates_question_explanation() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "ai".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        let question = db
            .create_question(sample_question_input(&bank.id, "题目"))
            .unwrap();
        let updated = db
            .update_question_explanation(&question.id, "  新解析  ")
            .unwrap();
        assert_eq!(updated.explanation_markdown.as_deref(), Some("新解析"));
    }

    #[test]
    fn migrate_records_version_one() {
        let db = temp_db();
        let v: i64 = db
            .connection()
            .unwrap()
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(v, 1);
    }
}
