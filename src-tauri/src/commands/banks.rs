use tauri::State;

use crate::{
    error::command_error,
    models::{CreateQuestionBankInput, QuestionBank},
    state::AppState,
};

#[tauri::command]
pub fn list_question_banks(state: State<'_, AppState>) -> Result<Vec<QuestionBank>, String> {
    state.database.list_question_banks().map_err(command_error)
}

#[tauri::command]
pub fn create_question_bank(
    input: CreateQuestionBankInput,
    state: State<'_, AppState>,
) -> Result<QuestionBank, String> {
    state
        .database
        .create_question_bank(input)
        .map_err(command_error)
}

#[tauri::command]
pub fn update_question_bank(
    id: String,
    input: CreateQuestionBankInput,
    state: State<'_, AppState>,
) -> Result<QuestionBank, String> {
    state
        .database
        .update_question_bank(&id, input)
        .map_err(command_error)
}

/// 删除题库，其下题目通过外键 ON DELETE CASCADE 自动清理。
#[tauri::command]
pub async fn delete_question_bank(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.database.clone_ref();
    tauri::async_runtime::spawn_blocking(move || {
        db.delete_question_bank(&id).map_err(command_error)
    })
    .await
    .map_err(|e| command_error(crate::error::AppError::Runtime(e.to_string())))?
}
