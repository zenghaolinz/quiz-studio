use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{CreateQuestionInput, Question, TestAttempt, TestSessionSnapshot},
};

mod assets;
mod banks;
mod migrations;
mod providers;

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
        if current.unwrap_or(0) < 2 {
            let has_ai_grading = connection
                .prepare("PRAGMA table_info(attempts)")?
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .any(|column| column == "ai_grading_json");
            if !has_ai_grading {
                connection.execute("ALTER TABLE attempts ADD COLUMN ai_grading_json TEXT", [])?;
            }
            connection.execute(
                "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, ?1)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        if current.unwrap_or(0) < 3 {
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    sha256 TEXT NOT NULL UNIQUE,
                    relative_path TEXT NOT NULL UNIQUE,
                    original_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    byte_size INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS asset_links (
                    id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                    parent_asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    provider_id TEXT,
                    model TEXT,
                    created_at TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_asset_links_asset_id ON asset_links(asset_id);
                 CREATE INDEX IF NOT EXISTS idx_asset_links_parent_id ON asset_links(parent_asset_id);",
            )?;
            connection.execute(
                "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (3, ?1)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        if current.unwrap_or(0) < 4 {
            migrations::migrate_fts_v4(connection)?;
        }
        Ok(())
    }

    fn connection(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.connection.lock().map_err(|_| AppError::PoisonedLock)
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

    pub fn update_question(&self, id: &str, input: CreateQuestionInput) -> AppResult<Question> {
        if input.stem_markdown.trim().is_empty() {
            return Err(AppError::InvalidConfig("题干不能为空".into()));
        }
        let max_score = input.max_score.unwrap_or(1.0);
        if max_score <= 0.0 {
            return Err(AppError::InvalidConfig("分值必须大于 0".into()));
        }
        let options_json = serde_json::to_string(&input.options)?;
        let answer_json = serde_json::to_string(&input.answer)?;
        let tags_json = serde_json::to_string(&input.tags.clone().unwrap_or_default())?;
        let now = Utc::now().to_rfc3339();
        {
            let connection = self.connection()?;
            let affected = connection.execute(
                "UPDATE questions SET bank_id = ?1, type = ?2, stem_markdown = ?3,
                        options_json = ?4, answer_json = ?5, explanation_markdown = ?6,
                        max_score = ?7, tags_json = ?8, updated_at = ?9
                 WHERE id = ?10",
                params![
                    input.bank_id,
                    input.question_type,
                    input.stem_markdown.trim(),
                    options_json,
                    answer_json,
                    input.explanation_markdown,
                    max_score,
                    tags_json,
                    now,
                    id,
                ],
            )?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("题目 {} 不存在", id)));
            }
            connection.execute(
                "UPDATE question_banks SET updated_at = ?1 WHERE id = ?2",
                params![now, input.bank_id],
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

    #[allow(clippy::too_many_arguments)]
    pub fn save_test_session(
        &self,
        session_id: Option<&str>,
        bank_id: &str,
        status: &str,
        settings: &serde_json::Value,
        attempts: &[(
            String,
            serde_json::Value,
            bool,
            Option<bool>,
            Option<f64>,
            Option<serde_json::Value>,
        )],
        score: Option<f64>,
        max_score: Option<f64>,
    ) -> AppResult<TestSessionSnapshot> {
        if !matches!(status, "in_progress" | "submitted") {
            return Err(AppError::InvalidConfig("自测状态无效".into()));
        }
        let id = session_id
            .map(str::to_owned)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();
        let settings_json = serde_json::to_string(settings)?;
        let mut connection = self.connection()?;
        let tx = connection.transaction()?;
        let existing_started: Option<String> = tx
            .query_row(
                "SELECT started_at FROM test_sessions WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()?;
        let started_at = existing_started.unwrap_or_else(|| now.clone());
        tx.execute(
            "INSERT INTO test_sessions (id, bank_id, mode, status, settings_json, score, max_score, started_at, submitted_at)
             VALUES (?1, ?2, 'test', ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET status=excluded.status, settings_json=excluded.settings_json,
                 score=excluded.score, max_score=excluded.max_score, submitted_at=excluded.submitted_at",
            params![id, bank_id, status, settings_json, score, max_score, started_at,
                if status == "submitted" { Some(now.clone()) } else { None }],
        )?;
        tx.execute("DELETE FROM attempts WHERE session_id = ?1", [&id])?;
        for (question_id, response, revealed, is_correct, attempt_score, ai_grading) in attempts {
            tx.execute(
                "INSERT INTO attempts (id, session_id, question_id, response_json, is_correct, score, answer_revealed, ai_grading_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![Uuid::new_v4().to_string(), id, question_id, serde_json::to_string(response)?,
                    is_correct.map(i64::from), attempt_score, i64::from(*revealed),
                    ai_grading.as_ref().map(serde_json::to_string).transpose()?, now],
            )?;
        }
        tx.commit()?;
        drop(connection);
        self.get_test_session(&id)?
            .ok_or_else(|| AppError::NotFound("自测会话不存在".into()))
    }

    pub fn get_active_test_session(&self, bank_id: &str) -> AppResult<Option<TestSessionSnapshot>> {
        let id = {
            let connection = self.connection()?;
            connection.query_row(
                "SELECT id FROM test_sessions WHERE bank_id = ?1 AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1",
                [bank_id], |row| row.get::<_, String>(0),
            ).optional()?
        };
        match id {
            Some(id) => self.get_test_session(&id),
            None => Ok(None),
        }
    }

    fn get_test_session(&self, id: &str) -> AppResult<Option<TestSessionSnapshot>> {
        let connection = self.connection()?;
        let mut snapshot = connection.query_row(
            "SELECT id, bank_id, status, settings_json, score, max_score, started_at, submitted_at FROM test_sessions WHERE id = ?1",
            [id], |row| {
                let settings: String = row.get(3)?;
                Ok(TestSessionSnapshot { id: row.get(0)?, bank_id: row.get(1)?, status: row.get(2)?,
                    settings: serde_json::from_str(&settings).unwrap_or_default(), score: row.get(4)?, max_score: row.get(5)?,
                    started_at: row.get(6)?, submitted_at: row.get(7)?, attempts: vec![] })
            }).optional()?;
        if let Some(session) = snapshot.as_mut() {
            let mut statement = connection.prepare(
                "SELECT id, question_id, response_json, is_correct, score, answer_revealed, ai_grading_json FROM attempts WHERE session_id = ?1 ORDER BY created_at ASC")?;
            session.attempts = statement
                .query_map([id], |row| {
                    let response: String = row.get(2)?;
                    Ok(TestAttempt {
                        id: row.get(0)?,
                        question_id: row.get(1)?,
                        response: serde_json::from_str(&response).unwrap_or_default(),
                        is_correct: row.get::<_, Option<i64>>(3)?.map(|value| value != 0),
                        score: row.get(4)?,
                        answer_revealed: row.get::<_, i64>(5)? != 0,
                        ai_grading: row
                            .get::<_, Option<String>>(6)?
                            .and_then(|value| serde_json::from_str(&value).ok()),
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
        }
        Ok(snapshot)
    }
}

/// 在给定事务/连接上插入一道题。create_question 与 create_questions_batch 共用。
/// 不负责更新 question_banks.updated_at（由调用方统一处理），以便批量只更新一次。
fn insert_question_tx(
    conn: &Connection,
    input: &CreateQuestionInput,
    now: &str,
) -> AppResult<Question> {
    let stem = input.stem_markdown.trim();
    if stem.is_empty() {
        return Err(AppError::InvalidConfig("题干不能为空".into()));
    }
    let id = Uuid::new_v4().to_string();
    let max_score = input.max_score.unwrap_or(1.0);
    if !max_score.is_finite() || max_score <= 0.0 {
        return Err(AppError::InvalidConfig("分值必须大于 0".into()));
    }
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
            stem,
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
        stem_markdown: stem.to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CreateQuestionBankInput;
    use serde_json::json;
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
    fn portable_restore_rolls_back_bank_and_questions_together() {
        use crate::models::{PortableQuestionInput, RestoreQuestionBankInput};

        let db = temp_db();
        let before = db.list_question_banks().unwrap().len();
        let result = db.restore_question_bank(RestoreQuestionBankInput {
            bank: CreateQuestionBankInput {
                name: "原子恢复测试".into(),
                subject: None,
                description: None,
            },
            questions: vec![
                PortableQuestionInput {
                    question_type: "true_false".into(),
                    stem_markdown: "有效题目".into(),
                    options: json!([]),
                    answer: json!({"kind":"boolean","value":true}),
                    explanation_markdown: None,
                    max_score: Some(1.0),
                    tags: Some(vec![]),
                },
                PortableQuestionInput {
                    question_type: "true_false".into(),
                    stem_markdown: " ".into(),
                    options: json!([]),
                    answer: json!({"kind":"boolean","value":true}),
                    explanation_markdown: None,
                    max_score: Some(1.0),
                    tags: Some(vec![]),
                },
            ],
        });

        assert!(result.is_err());
        assert_eq!(db.list_question_banks().unwrap().len(), before);
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
    fn updates_question_bank_metadata() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "旧名称".into(),
                subject: None,
                description: None,
            })
            .unwrap();

        let updated = db
            .update_question_bank(
                &bank.id,
                CreateQuestionBankInput {
                    name: "  新名称  ".into(),
                    subject: Some("数学".into()),
                    description: Some("代数".into()),
                },
            )
            .unwrap();

        assert_eq!(updated.name, "新名称");
        assert_eq!(updated.subject.as_deref(), Some("数学"));
        assert_eq!(updated.description.as_deref(), Some("代数"));
        assert!(matches!(
            db.update_question_bank(
                "missing",
                CreateQuestionBankInput {
                    name: "x".into(),
                    subject: None,
                    description: None,
                }
            ),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn updates_complete_question() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "edit".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        let question = db
            .create_question(sample_question_input(&bank.id, "旧题干"))
            .unwrap();
        let mut input = sample_question_input(&bank.id, "新题干");
        input.max_score = Some(3.0);
        input.tags = Some(vec!["新标签".into()]);

        let updated = db.update_question(&question.id, input).unwrap();

        assert_eq!(updated.stem_markdown, "新题干");
        assert_eq!(updated.max_score, 3.0);
        assert_eq!(updated.tags, vec!["新标签"]);
        assert!(matches!(
            db.update_question("missing", sample_question_input(&bank.id, "x")),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn question_updates_keep_full_text_index_in_sync() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "search".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        let question = db
            .create_question(sample_question_input(&bank.id, "旧关键词"))
            .unwrap();
        db.update_question(
            &question.id,
            sample_question_input(&bank.id, "量子新关键词"),
        )
        .unwrap();

        let connection = db.connection().unwrap();
        let new_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM questions_fts WHERE questions_fts MATCH '量子新关键词'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let old_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM questions_fts WHERE questions_fts MATCH '旧关键词'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(new_count, 1);
        assert_eq!(old_count, 0);
    }

    #[test]
    fn migrate_records_latest_version() {
        let db = temp_db();
        let v: i64 = db
            .connection()
            .unwrap()
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(v, 4);
        let asset_columns = db
            .connection()
            .unwrap()
            .prepare("PRAGMA table_info(assets)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(asset_columns.iter().any(|column| column == "sha256"));
        let link_columns = db
            .connection()
            .unwrap()
            .prepare("PRAGMA table_info(asset_links)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(link_columns
            .iter()
            .any(|column| column == "parent_asset_id"));
    }

    #[test]
    fn saves_and_recovers_active_test_session() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "session".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        let question = db
            .create_question(sample_question_input(&bank.id, "题目"))
            .unwrap();
        let saved = db
            .save_test_session(
                None,
                &bank.id,
                "in_progress",
                &serde_json::json!({"currentIndex": 0}),
                &[(
                    question.id.clone(),
                    serde_json::json!(["b"]),
                    false,
                    None,
                    None,
                    Some(serde_json::json!({"score": 3.5, "feedbackMarkdown": "已确认"})),
                )],
                None,
                None,
            )
            .unwrap();

        let recovered = db.get_active_test_session(&bank.id).unwrap().unwrap();
        assert_eq!(recovered.id, saved.id);
        assert_eq!(recovered.attempts.len(), 1);
        assert_eq!(recovered.attempts[0].response, serde_json::json!(["b"]));
        assert_eq!(
            recovered.attempts[0].ai_grading,
            Some(serde_json::json!({"score": 3.5, "feedbackMarkdown": "已确认"}))
        );
    }

    #[test]
    fn submitted_session_is_not_returned_as_active() {
        let db = temp_db();
        let bank = db
            .create_question_bank(CreateQuestionBankInput {
                name: "submitted".into(),
                subject: None,
                description: None,
            })
            .unwrap();
        db.save_test_session(
            None,
            &bank.id,
            "submitted",
            &serde_json::json!({}),
            &[],
            Some(0.0),
            Some(0.0),
        )
        .unwrap();
        assert!(db.get_active_test_session(&bank.id).unwrap().is_none());
    }
}
