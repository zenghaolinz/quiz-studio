use chrono::Utc;
use rusqlite::{params, OptionalExtension};

use super::Database;
use crate::{
    error::{AppError, AppResult},
    models::{
        ModelDownloadFile, ModelDownloadFileInput, ModelInstallation, ModelInstallationInput,
    },
};

const INSTALLATION_STATUSES: &[&str] = &[
    "planned",
    "downloading",
    "paused",
    "verifying",
    "installing",
    "ready",
    "failed",
    "removing",
];
const FILE_STATUSES: &[&str] = &[
    "pending",
    "downloading",
    "paused",
    "downloaded",
    "verified",
    "failed",
];

impl Database {
    pub fn upsert_model_installation(
        &self,
        input: ModelInstallationInput,
    ) -> AppResult<ModelInstallation> {
        validate_installation(&input)?;
        let now = Utc::now().to_rfc3339();
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO model_installations (
                model_id, revision, source, status, size_bytes, installed_at, verified_at,
                error_message, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
             ON CONFLICT(model_id) DO UPDATE SET
                revision=excluded.revision, source=excluded.source, status=excluded.status,
                size_bytes=excluded.size_bytes, installed_at=excluded.installed_at,
                verified_at=excluded.verified_at, error_message=excluded.error_message,
                updated_at=excluded.updated_at",
            params![
                input.model_id,
                input.revision,
                input.source,
                input.status,
                input.size_bytes,
                input.installed_at,
                input.verified_at,
                input.error_message,
                now,
            ],
        )?;
        drop(connection);
        self.get_model_installation(&input.model_id)?
            .ok_or_else(|| AppError::NotFound(format!("模型 {} 不存在", input.model_id)))
    }

    pub fn get_model_installation(&self, model_id: &str) -> AppResult<Option<ModelInstallation>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT model_id, revision, source, status, size_bytes, installed_at,
                        verified_at, error_message, created_at, updated_at
                 FROM model_installations WHERE model_id = ?1",
                [model_id],
                map_installation,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_model_installations(&self) -> AppResult<Vec<ModelInstallation>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT model_id, revision, source, status, size_bytes, installed_at,
                    verified_at, error_message, created_at, updated_at
             FROM model_installations ORDER BY created_at ASC",
        )?;
        let installations = statement
            .query_map([], map_installation)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into);
        installations
    }

    pub fn delete_model_installation(&self, model_id: &str) -> AppResult<bool> {
        let connection = self.connection()?;
        Ok(connection.execute(
            "DELETE FROM model_installations WHERE model_id = ?1",
            [model_id],
        )? > 0)
    }

    pub fn upsert_model_download_file(
        &self,
        input: ModelDownloadFileInput,
    ) -> AppResult<ModelDownloadFile> {
        validate_download_file(&input)?;
        let now = Utc::now().to_rfc3339();
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO model_download_files (
                model_id, path, downloaded_bytes, total_bytes, etag, status, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(model_id, path) DO UPDATE SET
                downloaded_bytes=excluded.downloaded_bytes,
                total_bytes=excluded.total_bytes, etag=excluded.etag,
                status=excluded.status, updated_at=excluded.updated_at",
            params![
                input.model_id,
                input.path,
                input.downloaded_bytes,
                input.total_bytes,
                input.etag,
                input.status,
                now,
            ],
        )?;
        connection
            .query_row(
                "SELECT model_id, path, downloaded_bytes, total_bytes, etag, status, updated_at
                 FROM model_download_files WHERE model_id = ?1 AND path = ?2",
                params![input.model_id, input.path],
                map_download_file,
            )
            .map_err(Into::into)
    }

    pub fn list_model_download_files(&self, model_id: &str) -> AppResult<Vec<ModelDownloadFile>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT model_id, path, downloaded_bytes, total_bytes, etag, status, updated_at
             FROM model_download_files WHERE model_id = ?1 ORDER BY path ASC",
        )?;
        let files = statement
            .query_map([model_id], map_download_file)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into);
        files
    }

    pub fn normalize_interrupted_model_jobs(&self) -> AppResult<usize> {
        let now = Utc::now().to_rfc3339();
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let installations = transaction.execute(
            "UPDATE model_installations
             SET status = 'paused', error_message = NULL, updated_at = ?1
             WHERE status IN ('downloading', 'verifying', 'installing')",
            [&now],
        )?;
        let files = transaction.execute(
            "UPDATE model_download_files SET status = 'paused', updated_at = ?1
             WHERE status = 'downloading'",
            [&now],
        )?;
        transaction.commit()?;
        Ok(installations + files)
    }
}

fn validate_installation(input: &ModelInstallationInput) -> AppResult<()> {
    if input.model_id.trim().is_empty()
        || input.revision.trim().is_empty()
        || input.source.trim().is_empty()
        || input.size_bytes <= 0
        || !INSTALLATION_STATUSES.contains(&input.status.as_str())
    {
        return Err(AppError::InvalidConfig("模型安装状态无效".into()));
    }
    Ok(())
}

fn validate_download_file(input: &ModelDownloadFileInput) -> AppResult<()> {
    let safe_path = !input.path.trim().is_empty()
        && !input.path.contains('/')
        && !input.path.contains('\\')
        && input.path != "."
        && input.path != "..";
    if input.model_id.trim().is_empty()
        || !safe_path
        || input.downloaded_bytes < 0
        || input.total_bytes <= 0
        || input.downloaded_bytes > input.total_bytes
        || !FILE_STATUSES.contains(&input.status.as_str())
    {
        return Err(AppError::InvalidConfig("模型下载断点无效".into()));
    }
    Ok(())
}

fn map_installation(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelInstallation> {
    Ok(ModelInstallation {
        model_id: row.get(0)?,
        revision: row.get(1)?,
        source: row.get(2)?,
        status: row.get(3)?,
        size_bytes: row.get(4)?,
        installed_at: row.get(5)?,
        verified_at: row.get(6)?,
        error_message: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_download_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelDownloadFile> {
    Ok(ModelDownloadFile {
        model_id: row.get(0)?,
        path: row.get(1)?,
        downloaded_bytes: row.get(2)?,
        total_bytes: row.get(3)?,
        etag: row.get(4)?,
        status: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use std::env;

    use super::super::Database;
    use crate::models::{ModelDownloadFileInput, ModelInstallationInput};

    fn temp_db() -> Database {
        let mut path = env::temp_dir();
        path.push(format!(
            "quiz-studio-model-state-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        Database::open(&path).expect("database should open and migrate")
    }

    fn installation(status: &str) -> ModelInstallationInput {
        ModelInstallationInput {
            model_id: "glm-ocr-q8".into(),
            revision: "65a42de".into(),
            source: "huggingface".into(),
            status: status.into(),
            size_bytes: 1_434_837_056,
            installed_at: None,
            verified_at: None,
            error_message: None,
        }
    }

    #[test]
    fn persists_installation_and_file_checkpoint() {
        let db = temp_db();
        let saved = db
            .upsert_model_installation(installation("downloading"))
            .unwrap();
        assert_eq!(saved.model_id, "glm-ocr-q8");
        assert_eq!(saved.status, "downloading");

        db.upsert_model_download_file(ModelDownloadFileInput {
            model_id: saved.model_id.clone(),
            path: "GLM-OCR-Q8_0.gguf".into(),
            downloaded_bytes: 4096,
            total_bytes: 950_433_408,
            etag: Some("etag-1".into()),
            status: "downloading".into(),
        })
        .unwrap();

        let files = db.list_model_download_files(&saved.model_id).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].downloaded_bytes, 4096);
        assert_eq!(files[0].etag.as_deref(), Some("etag-1"));
    }

    #[test]
    fn normalizes_interrupted_work_to_recoverable_states() {
        let mut path = env::temp_dir();
        path.push(format!(
            "quiz-studio-model-recovery-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        let db = Database::open(&path).unwrap();
        db.upsert_model_installation(installation("downloading"))
            .unwrap();
        db.upsert_model_download_file(ModelDownloadFileInput {
            model_id: "glm-ocr-q8".into(),
            path: "GLM-OCR-Q8_0.gguf".into(),
            downloaded_bytes: 4096,
            total_bytes: 950_433_408,
            etag: None,
            status: "downloading".into(),
        })
        .unwrap();
        drop(db);

        let db = Database::open(&path).unwrap();

        assert_eq!(
            db.get_model_installation("glm-ocr-q8")
                .unwrap()
                .unwrap()
                .status,
            "paused"
        );
        assert_eq!(
            db.list_model_download_files("glm-ocr-q8").unwrap()[0].status,
            "paused"
        );
    }

    #[test]
    fn deleting_installation_cascades_only_its_download_rows() {
        let db = temp_db();
        db.upsert_model_installation(installation("ready")).unwrap();
        db.upsert_model_download_file(ModelDownloadFileInput {
            model_id: "glm-ocr-q8".into(),
            path: "GLM-OCR-Q8_0.gguf".into(),
            downloaded_bytes: 950_433_408,
            total_bytes: 950_433_408,
            etag: None,
            status: "verified".into(),
        })
        .unwrap();

        assert!(db.delete_model_installation("glm-ocr-q8").unwrap());
        assert!(db
            .list_model_download_files("glm-ocr-q8")
            .unwrap()
            .is_empty());
        assert!(!db.delete_model_installation("glm-ocr-q8").unwrap());

        let question_banks: i64 = db
            .connection()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM question_banks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(question_banks, 0);
    }

    #[test]
    fn rejects_invalid_status_and_checkpoint_size() {
        let db = temp_db();
        assert!(db
            .upsert_model_installation(installation("mystery"))
            .is_err());
        db.upsert_model_installation(installation("planned"))
            .unwrap();
        assert!(db
            .upsert_model_download_file(ModelDownloadFileInput {
                model_id: "glm-ocr-q8".into(),
                path: "model.gguf".into(),
                downloaded_bytes: 2,
                total_bytes: 1,
                etag: None,
                status: "pending".into(),
            })
            .is_err());
    }
}
