mod commands;
mod db;
mod error;
mod models;
mod services;
mod state;

use tauri::Manager;

use crate::{db::Database, state::AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let database = Database::open(&app_data_dir.join("quiz-studio.sqlite3"))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let state = AppState::new(database)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health_check,
            commands::banks::list_question_banks,
            commands::banks::create_question_bank,
            commands::banks::delete_question_bank,
            commands::questions::list_questions,
            commands::questions::create_question,
            commands::questions::create_questions_batch,
            commands::questions::delete_question,
            commands::files::read_text_file,
            commands::providers::list_provider_configs,
            commands::providers::upsert_provider_config,
            commands::ocr::run_glm_ocr,
            commands::ai::generate_question_explanation,
            commands::ai::test_ai_provider,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Quiz Studio");
}
