use crate::{
    db::Database,
    error::{AppError, AppResult},
};

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
}

pub struct AppState {
    pub database: Database,
    pub secrets: SecretStore,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(database: Database) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()?;
        Ok(Self {
            database,
            secrets: SecretStore::new("com.quizstudio.providers"),
            http,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Verifies the platform credential store (Windows Credential Manager on this
    // machine) actually round-trips a secret. This is the one piece of the secret
    // pipeline that cannot be checked without a real keyring backend.
    #[test]
    fn secret_store_round_trips() {
        let store = SecretStore::new("com.quizstudio.smoke-test");
        let key = format!("test-key:{}", uuid::Uuid::new_v4());
        let value = "smoke-test-api-key";

        // Clean up any leftover, then set + read + clear.
        store.set(&key, value).expect("set should succeed on platform backend");
        let read = store.get_optional(&key).expect("get should not error");
        assert_eq!(read.as_deref(), Some(value));

        // keyring has no delete in this wrapper; re-overwrite with empty is not ideal,
        // so we leave the entry — it is namespaced under com.quizstudio.smoke-test.
    }
}
