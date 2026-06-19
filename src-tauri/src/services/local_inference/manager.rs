use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU8, Ordering},
        Arc, Mutex,
    },
};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::{
    db::Database,
    error::{AppError, AppResult},
    models::{ModelDownloadFileInput, ModelInstallationInput},
    services::local_inference::{
        bundled_catalog,
        download::{download, verify_file, DownloadProgress, DownloadRequest},
        manifest::{ModelCatalog, ModelManifest},
        sources::download_url,
    },
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelStatus {
    pub id: String,
    pub status: String,
    pub size_bytes: i64,
    pub downloaded_bytes: i64,
    pub source: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInstallPlan {
    pub model_id: String,
    pub source: String,
    pub required_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgressEvent {
    pub model_id: String,
    pub file: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub status: String,
}

pub type ProgressCallback = Arc<dyn Fn(ModelProgressEvent) + Send + Sync>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum JobStopReason {
    None = 0,
    Paused = 1,
    Cancelled = 2,
}

#[derive(Clone)]
pub struct JobHandle {
    pub token: CancellationToken,
    reason: Arc<AtomicU8>,
}

impl JobHandle {
    pub fn stop_reason(&self) -> JobStopReason {
        match self.reason.load(Ordering::SeqCst) {
            1 => JobStopReason::Paused,
            2 => JobStopReason::Cancelled,
            _ => JobStopReason::None,
        }
    }
}

#[derive(Default)]
pub struct JobRegistry {
    jobs: Mutex<HashMap<String, JobHandle>>,
}

impl JobRegistry {
    pub fn begin(&self, model_id: &str) -> AppResult<JobHandle> {
        let mut jobs = self.jobs.lock().map_err(|_| AppError::PoisonedLock)?;
        if jobs.contains_key(model_id) {
            return Err(AppError::Runtime("模型任务已在运行".into()));
        }
        let handle = JobHandle {
            token: CancellationToken::new(),
            reason: Arc::new(AtomicU8::new(JobStopReason::None as u8)),
        };
        jobs.insert(model_id.to_owned(), handle.clone());
        Ok(handle)
    }

    pub fn pause(&self, model_id: &str) -> AppResult<bool> {
        self.stop(model_id, JobStopReason::Paused)
    }

    pub fn cancel(&self, model_id: &str) -> AppResult<bool> {
        self.stop(model_id, JobStopReason::Cancelled)
    }

    fn stop(&self, model_id: &str, reason: JobStopReason) -> AppResult<bool> {
        let jobs = self.jobs.lock().map_err(|_| AppError::PoisonedLock)?;
        let Some(handle) = jobs.get(model_id) else {
            return Ok(false);
        };
        handle.reason.store(reason as u8, Ordering::SeqCst);
        handle.token.cancel();
        Ok(true)
    }

    pub fn finish(&self, model_id: &str) -> AppResult<()> {
        self.jobs
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .remove(model_id);
        Ok(())
    }

    pub fn is_active(&self, model_id: &str) -> AppResult<bool> {
        Ok(self
            .jobs
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .contains_key(model_id))
    }
}

#[derive(Clone)]
pub struct ModelManager {
    database: Database,
    catalog: Arc<ModelCatalog>,
    models_root: PathBuf,
    jobs: Arc<JobRegistry>,
    leases: Arc<Mutex<HashMap<String, usize>>>,
}

#[allow(dead_code)] // Held by the local OCR runtime integration in Task 8.
pub struct ModelLease {
    model_id: String,
    leases: Arc<Mutex<HashMap<String, usize>>>,
}

impl Drop for ModelLease {
    fn drop(&mut self) {
        if let Ok(mut leases) = self.leases.lock() {
            if let Some(count) = leases.get_mut(&self.model_id) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    leases.remove(&self.model_id);
                }
            }
        }
    }
}

impl ModelManager {
    pub fn new(database: Database, app_data_dir: PathBuf) -> AppResult<Self> {
        let models_root = app_data_dir.join("models");
        fs::create_dir_all(&models_root)?;
        Ok(Self {
            database,
            catalog: Arc::new(bundled_catalog()?),
            models_root,
            jobs: Arc::new(JobRegistry::default()),
            leases: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    #[allow(dead_code)] // Held by the local OCR runtime integration in Task 8.
    pub fn acquire_runtime_lease(&self, model_id: &str) -> AppResult<ModelLease> {
        self.catalog
            .model(model_id)
            .ok_or_else(|| AppError::NotFound(format!("model {model_id}")))?;
        let mut leases = self.leases.lock().map_err(|_| AppError::PoisonedLock)?;
        *leases.entry(model_id.to_owned()).or_default() += 1;
        Ok(ModelLease {
            model_id: model_id.to_owned(),
            leases: self.leases.clone(),
        })
    }

    pub fn list_models(&self) -> AppResult<Vec<LocalModelStatus>> {
        let installations = self
            .database
            .list_model_installations()?
            .into_iter()
            .map(|installation| (installation.model_id.clone(), installation))
            .collect::<HashMap<_, _>>();
        self.catalog
            .models
            .iter()
            .map(|model| {
                let size_bytes =
                    i64::try_from(model.files.iter().map(|file| file.size).sum::<u64>())
                        .map_err(|_| AppError::InvalidConfig("模型大小超出数据库范围".into()))?;
                let installation = installations.get(&model.id);
                let downloaded_bytes = self
                    .database
                    .list_model_download_files(&model.id)?
                    .iter()
                    .map(|file| file.downloaded_bytes)
                    .sum();
                Ok(LocalModelStatus {
                    id: model.id.clone(),
                    status: installation
                        .map(|value| value.status.clone())
                        .unwrap_or_else(|| "absent".into()),
                    size_bytes,
                    downloaded_bytes,
                    source: installation.map(|value| value.source.clone()),
                    error_message: installation.and_then(|value| value.error_message.clone()),
                })
            })
            .collect()
    }

    pub fn plan_install(&self, model_id: &str, source: &str) -> AppResult<ModelInstallPlan> {
        let model = self
            .catalog
            .model(model_id)
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id}")))?;
        if !model
            .sources
            .iter()
            .any(|candidate| candidate.kind.as_str() == source)
        {
            return Err(AppError::InvalidConfig("模型下载源不在内置清单中".into()));
        }
        let required_bytes = model.files.iter().map(|file| file.size).sum();
        Ok(ModelInstallPlan {
            model_id: model_id.into(),
            source: source.into(),
            required_bytes,
            available_bytes: fs2::available_space(&self.models_root)?,
        })
    }

    pub fn pause(&self, model_id: &str) -> AppResult<bool> {
        self.jobs.pause(model_id)
    }

    pub fn cancel(&self, model_id: &str) -> AppResult<bool> {
        self.jobs.cancel(model_id)
    }

    pub fn resume_source(&self, model_id: &str) -> AppResult<String> {
        self.database
            .get_model_installation(model_id)?
            .map(|installation| installation.source)
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id} 没有可恢复任务")))
    }

    pub async fn install(
        &self,
        model_id: &str,
        source_name: &str,
        progress: ProgressCallback,
    ) -> AppResult<()> {
        let handle = self.jobs.begin(model_id)?;
        let result = self
            .run_install(model_id, source_name, &handle, progress)
            .await;
        let cleanup = self.jobs.finish(model_id);
        match (result, cleanup) {
            (Err(error), _) => Err(error),
            (Ok(()), Err(error)) => Err(error),
            (Ok(()), Ok(())) => Ok(()),
        }
    }

    async fn run_install(
        &self,
        model_id: &str,
        source_name: &str,
        handle: &JobHandle,
        progress: ProgressCallback,
    ) -> AppResult<()> {
        let model = self
            .catalog
            .model(model_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id}")))?;
        let source = model
            .sources
            .iter()
            .find(|source| source.kind.as_str() == source_name)
            .cloned()
            .ok_or_else(|| AppError::InvalidConfig("模型下载源不在内置清单中".into()))?;
        let total_size = checked_size(&model)?;
        self.save_installation(&model, source_name, "downloading", None)?;
        let model_root = self.models_root.join(model_id);
        fs::create_dir_all(&model_root)?;
        let total_download_bytes = u64::try_from(total_size)
            .map_err(|_| AppError::InvalidConfig("model size is invalid".into()))?;
        let mut completed_bytes = 0_u64;

        for file in &model.files {
            let existing = self
                .database
                .list_model_download_files(model_id)?
                .into_iter()
                .find(|checkpoint| checkpoint.path == file.path);
            let part_path = model_root.join(format!("{}.part", file.path));
            let downloaded = fs::metadata(&part_path).map(|meta| meta.len()).unwrap_or(0);
            self.database
                .upsert_model_download_file(ModelDownloadFileInput {
                    model_id: model_id.into(),
                    path: file.path.clone(),
                    downloaded_bytes: i64::try_from(downloaded)
                        .map_err(|_| AppError::Runtime("下载断点过大".into()))?,
                    total_bytes: i64::try_from(file.size)
                        .map_err(|_| AppError::Runtime("模型文件过大".into()))?,
                    etag: existing
                        .as_ref()
                        .and_then(|checkpoint| checkpoint.etag.clone()),
                    status: "downloading".into(),
                })?;
            let database = self.database.clone();
            let model_id_owned = model_id.to_owned();
            let file_name = file.path.clone();
            let external_progress = progress.clone();
            let etag = existing.and_then(|checkpoint| checkpoint.etag);
            let completed_before_file = completed_bytes;
            let checkpoint_progress = Arc::new(move |state: DownloadProgress| {
                let _ = database.upsert_model_download_file(ModelDownloadFileInput {
                    model_id: model_id_owned.clone(),
                    path: file_name.clone(),
                    downloaded_bytes: i64::try_from(state.downloaded_bytes).unwrap_or(i64::MAX),
                    total_bytes: i64::try_from(state.total_bytes).unwrap_or(i64::MAX),
                    etag: etag.clone(),
                    status: "downloading".into(),
                });
                external_progress(ModelProgressEvent {
                    model_id: model_id_owned.clone(),
                    file: file_name.clone(),
                    downloaded_bytes: cumulative_progress(
                        completed_before_file,
                        state.downloaded_bytes,
                    ),
                    total_bytes: total_download_bytes,
                    status: "downloading".into(),
                });
            });
            let outcome = download(
                DownloadRequest {
                    url: download_url(&source, &file.path)?,
                    install_root: model_root.clone(),
                    destination: model_root.join(&file.path),
                    expected_size: file.size,
                    expected_sha256: file.sha256.clone(),
                    disk_budget: fs2::available_space(&model_root)?,
                    etag: existing_etag(&self.database, model_id, &file.path)?,
                    progress: Some(checkpoint_progress),
                },
                handle.token.clone(),
            )
            .await;
            match outcome {
                Ok(outcome) => {
                    completed_bytes = completed_bytes.saturating_add(file.size);
                    self.database
                        .upsert_model_download_file(ModelDownloadFileInput {
                            model_id: model_id.into(),
                            path: file.path.clone(),
                            downloaded_bytes: i64::try_from(outcome.bytes)
                                .map_err(|_| AppError::Runtime("模型文件过大".into()))?,
                            total_bytes: i64::try_from(file.size)
                                .map_err(|_| AppError::Runtime("模型文件过大".into()))?,
                            etag: outcome.etag,
                            status: "verified".into(),
                        })?;
                }
                Err(error) => {
                    self.finish_stopped_install(
                        &model,
                        source_name,
                        handle.stop_reason(),
                        &model_root,
                        &error,
                    )?;
                    return Err(error);
                }
            }
        }
        self.database
            .upsert_model_installation(ModelInstallationInput {
                model_id: model.id.clone(),
                revision: source.revision,
                source: source_name.into(),
                status: "ready".into(),
                size_bytes: total_size,
                installed_at: Some(chrono::Utc::now().to_rfc3339()),
                verified_at: Some(chrono::Utc::now().to_rfc3339()),
                error_message: None,
            })?;
        Ok(())
    }

    fn finish_stopped_install(
        &self,
        model: &ModelManifest,
        source: &str,
        reason: JobStopReason,
        model_root: &std::path::Path,
        error: &AppError,
    ) -> AppResult<()> {
        match reason {
            JobStopReason::Cancelled => {
                if model_root.exists() {
                    fs::remove_dir_all(model_root)?;
                }
                self.database.delete_model_installation(&model.id)?;
            }
            JobStopReason::Paused => {
                self.save_installation(model, source, "paused", None)?;
                self.pause_file_checkpoints(model)?;
            }
            JobStopReason::None => {
                self.save_installation(model, source, "failed", Some(error.to_string()))?;
            }
        }
        Ok(())
    }

    fn pause_file_checkpoints(&self, model: &ModelManifest) -> AppResult<()> {
        for checkpoint in self.database.list_model_download_files(&model.id)? {
            if checkpoint.status == "downloading" {
                self.database
                    .upsert_model_download_file(ModelDownloadFileInput {
                        model_id: checkpoint.model_id,
                        path: checkpoint.path,
                        downloaded_bytes: checkpoint.downloaded_bytes,
                        total_bytes: checkpoint.total_bytes,
                        etag: checkpoint.etag,
                        status: "paused".into(),
                    })?;
            }
        }
        Ok(())
    }

    fn save_installation(
        &self,
        model: &ModelManifest,
        source: &str,
        status: &str,
        error_message: Option<String>,
    ) -> AppResult<()> {
        let revision = model
            .sources
            .iter()
            .find(|candidate| candidate.kind.as_str() == source)
            .map(|source| source.revision.clone())
            .ok_or_else(|| AppError::InvalidConfig("模型下载源无效".into()))?;
        self.database
            .upsert_model_installation(ModelInstallationInput {
                model_id: model.id.clone(),
                revision,
                source: source.into(),
                status: status.into(),
                size_bytes: checked_size(model)?,
                installed_at: None,
                verified_at: None,
                error_message,
            })?;
        Ok(())
    }

    pub fn verify(&self, model_id: &str) -> AppResult<bool> {
        let model = self
            .catalog
            .model(model_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id}")))?;
        let source = self.resume_source(model_id)?;
        let root = self.models_root.join(model_id);
        self.save_installation(&model, &source, "verifying", None)?;
        for file in &model.files {
            if let Err(error) = verify_file(&root.join(&file.path), file.size, &file.sha256) {
                self.save_installation(&model, &source, "failed", Some(error.to_string()))?;
                return Ok(false);
            }
        }
        let installation = self
            .database
            .get_model_installation(model_id)?
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id}")))?;
        self.database
            .upsert_model_installation(ModelInstallationInput {
                model_id: model.id.clone(),
                revision: installation.revision,
                source,
                status: "ready".into(),
                size_bytes: checked_size(&model)?,
                installed_at: installation
                    .installed_at
                    .or_else(|| Some(chrono::Utc::now().to_rfc3339())),
                verified_at: Some(chrono::Utc::now().to_rfc3339()),
                error_message: None,
            })?;
        Ok(true)
    }

    pub fn remove(&self, model_id: &str) -> AppResult<bool> {
        if self.jobs.is_active(model_id)? {
            return Err(AppError::Runtime("模型任务运行时不能删除".into()));
        }
        if self
            .leases
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .get(model_id)
            .copied()
            .unwrap_or(0)
            > 0
        {
            return Err(AppError::Runtime(
                "model is currently in use and cannot be removed".into(),
            ));
        }
        self.catalog
            .model(model_id)
            .ok_or_else(|| AppError::NotFound(format!("模型 {model_id}")))?;
        let model_dir = self.models_root.join(model_id);
        if model_dir.parent() != Some(self.models_root.as_path()) {
            return Err(AppError::InvalidConfig("模型目录越界".into()));
        }
        let existed = model_dir.exists();
        if existed {
            fs::remove_dir_all(&model_dir)?;
        }
        Ok(self.database.delete_model_installation(model_id)? || existed)
    }
}

fn checked_size(model: &ModelManifest) -> AppResult<i64> {
    i64::try_from(model.files.iter().map(|file| file.size).sum::<u64>())
        .map_err(|_| AppError::InvalidConfig("模型大小超出数据库范围".into()))
}

fn cumulative_progress(completed_bytes: u64, current_file_bytes: u64) -> u64 {
    completed_bytes.saturating_add(current_file_bytes)
}

fn existing_etag(database: &Database, model_id: &str, path: &str) -> AppResult<Option<String>> {
    Ok(database
        .list_model_download_files(model_id)?
        .into_iter()
        .find(|checkpoint| checkpoint.path == path)
        .and_then(|checkpoint| checkpoint.etag))
}

#[cfg(test)]
mod tests {
    use std::{env, sync::Arc};

    use crate::{
        db::Database,
        models::{CreateQuestionBankInput, ModelInstallationInput},
    };

    use super::*;

    fn manager() -> (ModelManager, Database, std::path::PathBuf) {
        let root = env::temp_dir().join(format!("quiz-model-manager-{}", uuid::Uuid::new_v4()));
        let database = Database::open(&root.join("state.sqlite3")).unwrap();
        let manager = ModelManager::new(database.clone(), root.clone()).unwrap();
        (manager, database, root)
    }

    #[test]
    fn lists_bundled_models_as_absent_before_installation() {
        let (manager, _, _) = manager();
        let models = manager.list_models().unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "glm-ocr-q8");
        assert_eq!(models[0].status, "absent");
        assert_eq!(models[0].size_bytes, 1_434_837_056);
    }

    #[test]
    fn plans_only_manifest_declared_sources_and_space() {
        let (manager, _, _) = manager();
        let plan = manager.plan_install("glm-ocr-q8", "huggingFace").unwrap();
        assert_eq!(plan.required_bytes, 1_434_837_056);
        assert!(plan.available_bytes > 0);
        assert!(manager.plan_install("glm-ocr-q8", "arbitraryUrl").is_err());
    }

    #[test]
    fn job_registry_serializes_and_cancels_per_model() {
        let registry = JobRegistry::default();
        let first = registry.begin("glm-ocr-q8").unwrap();
        assert!(registry.begin("glm-ocr-q8").is_err());
        assert!(registry.pause("glm-ocr-q8").unwrap());
        assert!(first.token.is_cancelled());
        assert_eq!(first.stop_reason(), JobStopReason::Paused);
        registry.finish("glm-ocr-q8").unwrap();
        assert!(registry.begin("glm-ocr-q8").is_ok());
    }

    #[test]
    fn removing_a_model_never_deletes_question_data() {
        let (manager, database, root) = manager();
        database
            .create_question_bank(CreateQuestionBankInput {
                name: "keep".into(),
                subject: None,
                description: None,
            })
            .unwrap();

        let model_dir = root.join("models").join("glm-ocr-q8");
        fs::create_dir_all(&model_dir).unwrap();
        fs::write(model_dir.join("stale.part"), b"partial model").unwrap();

        assert!(manager.remove("glm-ocr-q8").unwrap());
        assert!(!model_dir.exists());
        assert_eq!(database.list_question_banks().unwrap().len(), 1);
    }

    #[test]
    fn verification_failure_is_persisted_for_repair() {
        let (manager, database, _) = manager();
        database
            .upsert_model_installation(ModelInstallationInput {
                model_id: "glm-ocr-q8".into(),
                revision: "main".into(),
                source: "huggingFace".into(),
                status: "ready".into(),
                size_bytes: 1_434_837_056,
                installed_at: Some(chrono::Utc::now().to_rfc3339()),
                verified_at: None,
                error_message: None,
            })
            .unwrap();

        assert!(!manager.verify("glm-ocr-q8").unwrap());
        let installation = database
            .get_model_installation("glm-ocr-q8")
            .unwrap()
            .unwrap();
        assert_eq!(installation.status, "failed");
        assert!(installation.error_message.is_some());
        assert_eq!(manager.resume_source("glm-ocr-q8").unwrap(), "huggingFace");
    }

    #[test]
    fn runtime_lease_blocks_removal_until_released() {
        let (manager, _, root) = manager();
        let model_dir = root.join("models").join("glm-ocr-q8");
        fs::create_dir_all(&model_dir).unwrap();
        let lease = manager.acquire_runtime_lease("glm-ocr-q8").unwrap();

        assert!(manager.remove("glm-ocr-q8").is_err());
        assert!(model_dir.exists());
        drop(lease);
        assert!(manager.remove("glm-ocr-q8").unwrap());
    }

    #[test]
    fn progress_callback_is_sendable_for_background_commands() {
        let callback: ProgressCallback = Arc::new(|event| {
            assert!(event.downloaded_bytes <= event.total_bytes);
        });
        callback(ModelProgressEvent {
            model_id: "glm-ocr-q8".into(),
            file: "model.gguf".into(),
            downloaded_bytes: 1,
            total_bytes: 2,
            status: "downloading".into(),
        });
    }

    #[test]
    fn progress_does_not_reset_between_model_files() {
        assert_eq!(cumulative_progress(700, 25), 725);
        assert_eq!(cumulative_progress(u64::MAX, 1), u64::MAX);
    }
}
