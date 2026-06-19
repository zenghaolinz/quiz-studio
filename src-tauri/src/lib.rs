mod commands;
mod db;
mod error;
mod models;
mod services;
mod state;

use std::sync::Arc;

use tauri::Manager;

use crate::{
    db::Database,
    services::local_inference::{
        llama_server::{LlamaServerBackend, ServerOptions},
        process::SystemProcessSpawner,
        runtime::stage_runtime,
    },
    state::AppState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let database = Database::open(&app_data_dir.join("quiz-studio.sqlite3"))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let local_backend =
                find_llama_runtime().and_then(|(packaged_executable, packaged_runtime)| {
                    let target = tauri::utils::platform::target_triple().ok()?;
                    let executable = stage_runtime(
                        &packaged_executable,
                        &packaged_runtime,
                        &app_data_dir,
                        &target,
                    )
                    .ok()?;
                    let runtime_dir = executable.parent()?.to_owned();
                    LlamaServerBackend::with_runtime(
                        executable,
                        Some(runtime_dir),
                        ServerOptions::default(),
                        Arc::new(SystemProcessSpawner),
                    )
                    .ok()
                    .map(|backend| {
                        Arc::new(backend)
                            as Arc<dyn services::local_inference::backend::LocalInferenceBackend>
                    })
                });
            let state = AppState::new(database, app_data_dir, local_backend)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health_check,
            commands::assets::import_asset,
            commands::assets::get_asset_info,
            commands::assets::get_asset_details,
            commands::assets::read_text_asset,
            commands::assets::get_asset_data_url,
            commands::banks::list_question_banks,
            commands::banks::create_question_bank,
            commands::banks::update_question_bank,
            commands::banks::restore_question_bank,
            commands::banks::delete_question_bank,
            commands::questions::list_questions,
            commands::questions::create_question,
            commands::questions::update_question,
            commands::questions::create_questions_batch,
            commands::questions::delete_question,
            commands::sessions::save_test_session,
            commands::sessions::get_active_test_session,
            commands::files::read_text_file,
            commands::document_import::extract_document_file,
            commands::providers::list_provider_configs,
            commands::providers::upsert_provider_config,
            commands::providers::delete_provider_config,
            commands::models::list_local_models,
            commands::models::plan_local_model_install,
            commands::models::start_local_model_download,
            commands::models::pause_local_model_download,
            commands::models::resume_local_model_download,
            commands::models::cancel_local_model_download,
            commands::models::verify_local_model,
            commands::models::repair_local_model,
            commands::models::remove_local_model,
            commands::local_ocr::begin_local_ocr_queue,
            commands::local_ocr::run_local_glm_ocr,
            commands::local_ocr::finish_local_ocr_queue,
            commands::ocr::run_glm_ocr,
            commands::ocr::cancel_ocr_task,
            commands::ocr::persist_local_ocr_artifacts,
            commands::ai::generate_question_explanation,
            commands::ai::generate_subjective_grade,
            commands::ai::test_ai_provider,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Quiz Studio");
}

fn find_llama_runtime() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let executable_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    let target = tauri::utils::platform::target_triple().ok()?;
    let executable_root = std::env::current_exe().ok()?.parent()?.to_owned();
    let installed_executable = executable_root.join(executable_name);
    let installed_runtime = executable_root
        .join("resources")
        .join("llama-runtime")
        .join(&target);
    if installed_executable.is_file() && installed_runtime.is_dir() {
        return Some((installed_executable, installed_runtime));
    }
    let manifest_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let development_executable = manifest_root.join("binaries").join(format!(
        "llama-server-{target}{}",
        if cfg!(windows) { ".exe" } else { "" }
    ));
    let development_runtime = manifest_root
        .join("resources")
        .join("llama-runtime")
        .join(target);
    (development_executable.is_file() && development_runtime.is_dir())
        .then_some((development_executable, development_runtime))
}
