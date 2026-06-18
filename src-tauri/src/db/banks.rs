use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::{insert_question_tx, Database};
use crate::{
    error::{AppError, AppResult},
    models::{
        CreateQuestionBankInput, CreateQuestionInput, QuestionBank, RestoreQuestionBankInput,
    },
};

impl Database {
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

    pub fn restore_question_bank(
        &self,
        input: RestoreQuestionBankInput,
    ) -> AppResult<QuestionBank> {
        let RestoreQuestionBankInput { bank, questions } = input;
        let name = bank.name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidConfig("题库名称不能为空".into()));
        }
        if questions.is_empty() {
            return Err(AppError::InvalidConfig("题库至少包含一道题".into()));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let mut connection = self.connection()?;
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT INTO question_banks (id, name, subject, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                id,
                name,
                bank.subject.as_deref(),
                bank.description.as_deref(),
                now
            ],
        )?;
        let question_count = questions.len() as i64;
        for portable in questions {
            insert_question_tx(
                &tx,
                &CreateQuestionInput {
                    bank_id: id.clone(),
                    question_type: portable.question_type,
                    stem_markdown: portable.stem_markdown,
                    options: portable.options,
                    answer: portable.answer,
                    explanation_markdown: portable.explanation_markdown,
                    max_score: portable.max_score,
                    tags: portable.tags,
                },
                &now,
            )?;
        }
        tx.commit()?;
        Ok(QuestionBank {
            id,
            name: name.to_string(),
            subject: bank.subject,
            description: bank.description,
            question_count,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_question_bank(
        &self,
        id: &str,
        input: CreateQuestionBankInput,
    ) -> AppResult<QuestionBank> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidConfig("题库名称不能为空".into()));
        }
        let now = Utc::now().to_rfc3339();
        {
            let connection = self.connection()?;
            let affected = connection.execute(
                "UPDATE question_banks SET name = ?1, subject = ?2, description = ?3, updated_at = ?4 WHERE id = ?5",
                params![name, input.subject, input.description, now, id],
            )?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("题库 {} 不存在", id)));
            }
        }
        self.list_question_banks()?
            .into_iter()
            .find(|bank| bank.id == id)
            .ok_or_else(|| AppError::NotFound(format!("题库 {} 不存在", id)))
    }
}
