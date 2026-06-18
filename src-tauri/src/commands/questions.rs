use tauri::State;

use crate::{
    error::command_error,
    models::{CreateQuestionInput, Question},
    state::AppState,
};

#[tauri::command]
pub fn list_questions(
    bank_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Question>, String> {
    state
        .database
        .list_questions(&bank_id)
        .map_err(command_error)
}

#[tauri::command]
pub fn create_question(
    input: CreateQuestionInput,
    state: State<'_, AppState>,
) -> Result<Question, String> {
    state.database.create_question(input).map_err(command_error)
}

#[tauri::command]
pub fn update_question(
    id: String,
    input: CreateQuestionInput,
    state: State<'_, AppState>,
) -> Result<Question, String> {
    state
        .database
        .update_question(&id, input)
        .map_err(command_error)
}

/// 批量导入题目：单一事务，任一失败回滚整批。返回成功写入题数。
#[tauri::command]
pub async fn create_questions_batch(
    bank_id: String,
    questions: Vec<CreateQuestionInput>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let db = state.database.clone_ref();
    tauri::async_runtime::spawn_blocking(move || {
        db.create_questions_batch(&bank_id, &questions)
            .map_err(command_error)
    })
    .await
    .map_err(|e| command_error(crate::error::AppError::Runtime(e.to_string())))?
}

#[tauri::command]
pub async fn delete_question(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.database.clone_ref();
    tauri::async_runtime::spawn_blocking(move || db.delete_question(&id).map_err(command_error))
        .await
        .map_err(|e| command_error(crate::error::AppError::Runtime(e.to_string())))?
}
