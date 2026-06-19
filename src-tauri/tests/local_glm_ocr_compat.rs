use std::{
    env, fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use base64::Engine;
use quiz_studio_lib::local_ocr_compat::{
    InstalledModel, LlamaServerBackend, LocalInferenceBackend, LocalOcrRequest, RuntimeStatus,
    ServerOptions, SystemProcessSpawner,
};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityFixture {
    prompt: String,
    required_fragments: Vec<String>,
}

fn required_env(name: &str) -> Option<PathBuf> {
    env::var_os(name).map(PathBuf::from)
}

#[tokio::test]
async fn pinned_glm_ocr_runtime_passes_the_real_compatibility_gate() {
    let Some(server) = required_env("QUIZ_STUDIO_LLAMA_SERVER") else {
        eprintln!("skipped: set QUIZ_STUDIO_LLAMA_SERVER to run the real compatibility gate");
        return;
    };
    let model_path =
        required_env("QUIZ_STUDIO_GLM_MODEL").expect("QUIZ_STUDIO_GLM_MODEL is required");
    let mmproj_path =
        required_env("QUIZ_STUDIO_GLM_MMPROJ").expect("QUIZ_STUDIO_GLM_MMPROJ is required");
    let image_path =
        required_env("QUIZ_STUDIO_GLM_FIXTURE").expect("QUIZ_STUDIO_GLM_FIXTURE is required");
    let fixture: CompatibilityFixture =
        serde_json::from_str(include_str!("fixtures/glm-ocr/manifest.json")).unwrap();
    let mime = match image_path.extension().and_then(|value| value.to_str()) {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "image/png",
    };
    let image = base64::engine::general_purpose::STANDARD.encode(fs::read(image_path).unwrap());
    let request = || {
        LocalOcrRequest::new(
            format!("data:{mime};base64,{image}"),
            fixture.prompt.clone(),
        )
        .unwrap()
    };
    let backend = LlamaServerBackend::with_runtime(
        server.clone(),
        server.parent().map(PathBuf::from),
        ServerOptions {
            idle_timeout: Duration::from_secs(300),
            ..ServerOptions::default()
        },
        Arc::new(SystemProcessSpawner),
    )
    .unwrap();
    let model = InstalledModel::new("glm-ocr-q8", model_path, mmproj_path).unwrap();

    let cold_started = Instant::now();
    backend.load(&model).await.unwrap();
    let cold = backend
        .recognize(request(), CancellationToken::new())
        .await
        .unwrap();
    let cold_elapsed = cold_started.elapsed();
    assert!(!cold.markdown.trim().is_empty());
    eprintln!("cold OCR output:\n{}", cold.markdown);
    for fragment in &fixture.required_fragments {
        assert!(
            cold.markdown.contains(fragment),
            "missing required fragment: {fragment}; OCR output: {}",
            cold.markdown
        );
    }

    let warm_started = Instant::now();
    let warm = backend
        .recognize(request(), CancellationToken::new())
        .await
        .unwrap();
    let warm_elapsed = warm_started.elapsed();
    assert!(!warm.markdown.trim().is_empty());

    let cancelled = CancellationToken::new();
    cancelled.cancel();
    let cancel_started = Instant::now();
    assert!(backend.recognize(request(), cancelled).await.is_err());
    assert!(cancel_started.elapsed() < Duration::from_secs(2));

    backend.unload().await.unwrap();
    assert_eq!(
        backend.health().await.unwrap().status,
        RuntimeStatus::Stopped
    );
    eprintln!("cold={cold_elapsed:?}, warm={warm_elapsed:?}");
}
