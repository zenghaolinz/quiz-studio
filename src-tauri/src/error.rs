use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("secret-store error: {0}")]
    SecretStore(String),
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("state lock is poisoned")]
    PoisonedLock,
    #[error("runtime error: {0}")]
    Runtime(String),
}

pub type AppResult<T> = Result<T, AppError>;

pub fn command_error(error: AppError) -> String {
    error.to_string()
}
