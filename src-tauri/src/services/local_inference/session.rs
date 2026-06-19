use std::{collections::HashMap, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    services::local_inference::manager::ModelLease,
};

struct QueueSession {
    model_id: String,
    _lease: Option<ModelLease>,
}

#[derive(Default)]
pub struct LocalOcrSessionRegistry {
    sessions: Mutex<HashMap<String, QueueSession>>,
}

impl LocalOcrSessionRegistry {
    pub fn begin(&self, queue_id: &str, model_id: &str, lease: ModelLease) -> AppResult<()> {
        self.insert(queue_id, model_id, Some(lease))
    }

    fn insert(&self, queue_id: &str, model_id: &str, lease: Option<ModelLease>) -> AppResult<()> {
        if queue_id.trim().is_empty() || model_id.trim().is_empty() {
            return Err(AppError::InvalidConfig(
                "local OCR session id is empty".into(),
            ));
        }
        let mut sessions = self.sessions.lock().map_err(|_| AppError::PoisonedLock)?;
        if sessions.contains_key(queue_id) {
            return Err(AppError::Runtime(
                "local OCR queue is already active".into(),
            ));
        }
        sessions.insert(
            queue_id.to_owned(),
            QueueSession {
                model_id: model_id.to_owned(),
                _lease: lease,
            },
        );
        Ok(())
    }

    pub fn model_id(&self, queue_id: &str) -> AppResult<String> {
        self.sessions
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .get(queue_id)
            .map(|session| session.model_id.clone())
            .ok_or_else(|| AppError::NotFound(format!("local OCR queue {queue_id}")))
    }

    pub fn contains(&self, queue_id: &str) -> AppResult<bool> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .contains_key(queue_id))
    }

    pub fn finish(&self, queue_id: &str) -> AppResult<bool> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| AppError::PoisonedLock)?
            .remove(queue_id)
            .is_some())
    }

    #[cfg(test)]
    pub fn begin_for_test(&self, queue_id: &str, model_id: &str) -> AppResult<()> {
        self.insert(queue_id, model_id, None)
    }
}
