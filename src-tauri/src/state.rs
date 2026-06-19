use crate::{
    db::Database,
    error::{AppError, AppResult},
    services::{assets::AssetStore, local_inference},
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct OcrTaskRegistry {
    tasks: Mutex<HashMap<String, CancellationToken>>,
}

impl OcrTaskRegistry {
    pub fn register(&self, task_id: String) -> AppResult<CancellationToken> {
        let token = CancellationToken::new();
        self.tasks
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .insert(task_id, token.clone());
        Ok(token)
    }

    pub fn cancel(&self, task_id: &str) -> AppResult<bool> {
        let token = self
            .tasks
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .remove(task_id);
        if let Some(token) = token {
            token.cancel();
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn remove(&self, task_id: &str) -> AppResult<()> {
        self.tasks
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .remove(task_id);
        Ok(())
    }
}

pub struct SecretStore {
    service: String,
}

impl SecretStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    pub fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|error| AppError::SecretStore(error.to_string()))?;
        entry
            .set_password(value)
            .map_err(|error| AppError::SecretStore(error.to_string()))
    }

    pub fn get_optional(&self, key: &str) -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|error| AppError::SecretStore(error.to_string()))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(AppError::SecretStore(error.to_string())),
        }
    }

    pub fn delete(&self, key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|error| AppError::SecretStore(error.to_string()))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(AppError::SecretStore(error.to_string())),
        }
    }
}

pub struct AppState {
    pub database: Database,
    pub secrets: SecretStore,
    pub http: reqwest::Client,
    pub assets: AssetStore,
    pub ocr_tasks: OcrTaskRegistry,
    #[allow(dead_code)] // Read by the local OCR command layer in Task 8.
    pub local_inference: Option<Arc<dyn local_inference::backend::LocalInferenceBackend>>,
}

impl AppState {
    pub fn new(database: Database, app_data_dir: std::path::PathBuf) -> AppResult<Self> {
        local_inference::bundled_catalog()?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()?;
        Ok(Self {
            database,
            secrets: SecretStore::new("com.quizstudio.providers"),
            http,
            assets: AssetStore::new(app_data_dir),
            ocr_tasks: OcrTaskRegistry::default(),
            local_inference: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ocr_task_registry_cancels_registered_task() {
        let registry = OcrTaskRegistry::default();
        let token = registry.register("page-1".into()).unwrap();

        assert!(registry.cancel("page-1").unwrap());
        assert!(token.is_cancelled());
        assert!(!registry.cancel("page-1").unwrap());
    }

    // Verifies the platform credential store (Windows Credential Manager on this
    // machine) actually round-trips a secret. This is the one piece of the secret
    // pipeline that cannot be checked without a real keyring backend.
    #[test]
    fn secret_store_round_trips() {
        let store = SecretStore::new("com.quizstudio.smoke-test");
        let key = format!("test-key:{}", uuid::Uuid::new_v4());
        let value = "smoke-test-api-key";

        // Set, read, and remove from the platform credential store.
        store
            .set(&key, value)
            .expect("set should succeed on platform backend");
        let read = store.get_optional(&key).expect("get should not error");
        assert_eq!(read.as_deref(), Some(value));

        store.delete(&key).expect("delete should succeed");
        assert!(store.get_optional(&key).unwrap().is_none());
    }
}
