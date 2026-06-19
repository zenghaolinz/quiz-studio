use chrono::Utc;
use rusqlite::{params, Connection};

use crate::error::AppResult;

pub(super) fn migrate_fts_v4(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "DROP TRIGGER IF EXISTS questions_fts_insert;
         DROP TRIGGER IF EXISTS questions_fts_delete;
         DROP TRIGGER IF EXISTS questions_fts_update;
         DROP TABLE IF EXISTS questions_fts;
         CREATE VIRTUAL TABLE questions_fts USING fts5(
            id UNINDEXED,
            stem_markdown,
            explanation_markdown,
            content='questions',
            content_rowid='rowid'
         );
         CREATE TRIGGER questions_fts_insert AFTER INSERT ON questions BEGIN
            INSERT INTO questions_fts(rowid, id, stem_markdown, explanation_markdown)
            VALUES (new.rowid, new.id, new.stem_markdown, new.explanation_markdown);
         END;
         CREATE TRIGGER questions_fts_delete AFTER DELETE ON questions BEGIN
            INSERT INTO questions_fts(questions_fts, rowid, id, stem_markdown, explanation_markdown)
            VALUES ('delete', old.rowid, old.id, old.stem_markdown, old.explanation_markdown);
         END;
         CREATE TRIGGER questions_fts_update AFTER UPDATE ON questions BEGIN
            INSERT INTO questions_fts(questions_fts, rowid, id, stem_markdown, explanation_markdown)
            VALUES ('delete', old.rowid, old.id, old.stem_markdown, old.explanation_markdown);
            INSERT INTO questions_fts(rowid, id, stem_markdown, explanation_markdown)
            VALUES (new.rowid, new.id, new.stem_markdown, new.explanation_markdown);
         END;
         INSERT INTO questions_fts(rowid, id, stem_markdown, explanation_markdown)
         SELECT rowid, id, stem_markdown, explanation_markdown FROM questions;",
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (4, ?1)",
        params![Utc::now().to_rfc3339()],
    )?;
    Ok(())
}
