use tauri::State;

use crate::{
    error::command_error,
    models::{SaveTestSessionInput, TestSessionSnapshot},
    state::AppState,
};

#[tauri::command]
pub fn save_test_session(
    input: SaveTestSessionInput,
    state: State<'_, AppState>,
) -> Result<TestSessionSnapshot, String> {
    let attempts = input
        .attempts
        .into_iter()
        .map(|attempt| {
            (
                attempt.question_id,
                attempt.response,
                attempt.answer_revealed,
                attempt.is_correct,
                attempt.score,
            )
        })
        .collect::<Vec<_>>();
    state
        .database
        .save_test_session(
            input.id.as_deref(),
            &input.bank_id,
            &input.status,
            &input.settings,
            &attempts,
            input.score,
            input.max_score,
        )
        .map_err(command_error)
}

#[tauri::command]
pub fn get_active_test_session(
    bank_id: String,
    state: State<'_, AppState>,
) -> Result<Option<TestSessionSnapshot>, String> {
    state
        .database
        .get_active_test_session(&bank_id)
        .map_err(command_error)
}
