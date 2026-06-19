# GLM-OCR llama.cpp Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver an application-managed GLM-OCR runtime with resumable Hugging Face/ModelScope GGUF downloads, first through a pinned `llama-server` compatibility backend and then through a directly linked `libllama` backend behind the same interface.

**Architecture:** Rust owns model manifests, download/install state, runtime lifecycle and OCR inference. A `LocalInferenceBackend` boundary keeps the product flow independent from transport: `LlamaServerBackend` proves compatibility first, then `LibLlamaBackend` replaces HTTP without changing Tauri commands, the OCR queue or UI. The model is Q8 GGUF plus mmproj; the application bundle contains runtime binaries/libraries but no model weights.

**Tech Stack:** Rust, Tauri 2, reqwest, rusqlite, SHA-256, llama.cpp b9716, llama/mtmd C APIs, React 19, TypeScript, Vitest.

---

### Task 1: Runtime and model manifest domain

**Files:**
- Create: `src-tauri/src/services/local_inference/mod.rs`
- Create: `src-tauri/src/services/local_inference/manifest.rs`
- Create: `src-tauri/resources/glm-ocr-models.json`
- Modify: `src-tauri/src/services/mod.rs`

**Step 1: Write failing tests**

Cover parsing the embedded schema, rejecting path traversal, duplicate paths, zero/oversized files, missing main/mmproj roles, unsupported runtime versions and invalid SHA-256 values. Assert the default manifest resolves:

- `GLM-OCR-Q8_0.gguf`, 950,433,408 bytes, SHA-256 `f5899ad12b29350282240cf48c28e48aec8eeacbeacd5134a3e7d6c7ffa6819f`;
- `mmproj-GLM-OCR-Q8_0.gguf`, 484,403,648 bytes, SHA-256 `e14281d28129fbfafcfcdffd2f1d2d73bdcb5c2d74105d32f45fc3cd1c69e5a5`;
- Hugging Face revision `65a42de1148dbed2297e922b5dbc7d9b70c36578`.

**Step 2: Verify RED**

Run: `cargo test services::local_inference::manifest::tests -- --nocapture`

Expected: compilation fails because `local_inference::manifest` does not exist.

**Step 3: Implement the manifest parser**

Use serde structs with explicit `schema_version`, model/runtime constraints, file roles and source templates. Keep URL construction out of serde types. Confine all relative paths to one filename segment in v1.

**Step 4: Verify GREEN**

Run the focused tests and `cargo check`.

**Step 5: Commit**

Commit message: `feat: add local inference model manifest`

### Task 2: Persistent component and download state

**Files:**
- Modify: `src-tauri/src/db/schema.sql`
- Modify: `src-tauri/src/db/migrations.rs`
- Create: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/models.rs`

**Step 1: Write failing database tests**

Cover migration version 5, installation upsert/read/delete, per-file checkpoint updates, interrupted-state normalization and isolation from question-bank/assets deletion.

**Step 2: Verify RED**

Run: `cargo test db::models::tests -- --nocapture`

Expected: module/table methods are missing.

**Step 3: Add schema and repository**

Create `model_installations` and `model_download_files`. Store status as validated strings, byte counts as checked `i64`, source/revision/hash metadata and timestamps. Put repository methods in `db/models.rs`, not the legacy facade.

**Step 4: Verify GREEN**

Run focused tests, migration tests and `cargo check`.

**Step 5: Commit**

Commit message: `feat: persist model installation state`

### Task 3: Confined resumable downloader

**Files:**
- Create: `src-tauri/src/services/local_inference/download.rs`
- Create: `src-tauri/src/services/local_inference/sources.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write failing tests with a local HTTP fixture**

Use a local test server, not external model sites. Cover full download, HTTP Range resume, a server ignoring Range, ETag change, retryable interruption, cancellation, SHA mismatch, content-length mismatch, disk-budget rejection and atomic rename. Verify URLs for both source adapters are percent-encoded and pinned to a revision.

**Step 2: Verify RED**

Run: `cargo test services::local_inference::download::tests -- --nocapture`

Expected: downloader API is missing.

**Step 3: Implement minimal download engine**

Stream to `<file>.part`, update the SQLite checkpoint at bounded intervals, hash while completing verification, and rename only after all checks pass. Use a cancellation token and a maximum of two concurrent model files. Never expose an arbitrary URL IPC command.

**Step 4: Verify GREEN**

Run focused tests and all asset confinement tests.

**Step 5: Commit**

Commit message: `feat: add resumable model downloads`

### Task 4: Runtime backend contract and llama-server compatibility

**Files:**
- Create: `src-tauri/src/services/local_inference/backend.rs`
- Create: `src-tauri/src/services/local_inference/llama_server.rs`
- Create: `src-tauri/src/services/local_inference/process.rs`
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write failing contract tests**

Define the desired API first:

```rust
#[async_trait]
pub trait LocalInferenceBackend: Send + Sync {
    async fn health(&self) -> AppResult<RuntimeHealth>;
    async fn load(&self, model: &InstalledModel) -> AppResult<()>;
    async fn recognize(&self, request: LocalOcrRequest, cancel: CancellationToken)
        -> AppResult<LocalOcrResponse>;
    async fn unload(&self) -> AppResult<()>;
}
```

Test command construction, loopback-only binding, main/mmproj paths, context/GPU arguments, readiness timeout, bounded restart, idle shutdown, cancellation and process-tree termination through an injected process adapter.

**Step 2: Verify RED**

Run: `cargo test services::local_inference::llama_server::tests -- --nocapture`

Expected: backend types are missing.

**Step 3: Implement the compatibility backend**

Start pinned `llama-server` on a random loopback port, call its OpenAI-compatible multimodal endpoint with the official OCR prompt, and normalize output into `LocalOcrResponse`. Keep process invocation entirely in Rust; frontend shell permissions remain absent.

**Step 4: Verify GREEN**

Use a fake executable/server fixture for normal CI. Run focused tests and `cargo check`.

**Step 5: Commit**

Commit message: `feat: manage llama server compatibility backend`

### Task 5: Package pinned llama.cpp runtime artifacts

**Files:**
- Create: `scripts/fetch-llama-runtime.mjs`
- Create: `scripts/verify-llama-runtime.mjs`
- Create: `src-tauri/binaries/.gitkeep`
- Create: `src-tauri/resources/llama-runtime/.gitkeep`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `docs/THIRD_PARTY_RUNTIME.md`

**Step 1: Write failing script tests**

Test target-triple mapping, release asset selection, checksum manifest parsing, archive path traversal rejection and missing dynamic-library rejection using local fixture archives.

**Step 2: Verify RED**

Run: `npm test -- scripts/llamaRuntime.test.ts`

Expected: fetch/verify module is missing.

**Step 3: Implement deterministic artifact preparation**

Pin llama.cpp release `b9716`. Download only in an explicit developer/release script, verify a repository-owned checksum manifest, extract into ignored build inputs, and copy target-triple-named sidecar/runtime resources for Tauri. Do not download binaries during ordinary application startup or `npm install`.

**Step 4: Verify GREEN**

Run script tests, Tauri config validation and a packaging dry run without model weights.

**Step 5: Commit**

Commit message: `build: package pinned llama cpp runtime`

### Task 6: Model manager commands and events

**Files:**
- Create: `src-tauri/src/commands/models.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/state.rs`

**Step 1: Write failing service/command tests**

Cover list status, plan space, start/pause/resume/cancel, verify/repair, remove, event progress and restart recovery. Test that removing a model never removes `assets/` or question data.

**Step 2: Verify RED**

Run the focused Rust tests and confirm missing commands.

**Step 3: Implement orchestration**

Commands call a `ModelManager`; they do not perform downloads directly. Emit bounded progress events with job/file/byte counts. Serialize destructive operations per model and reject removal while a runtime lease is active.

**Step 4: Verify GREEN**

Run focused tests and `cargo test`.

**Step 5: Commit**

Commit message: `feat: expose local model manager commands`

### Task 7: Model management UI

**Files:**
- Create: `src/domain/localModel.ts`
- Create: `src/features/models/api.ts`
- Create: `src/features/models/modelState.test.ts`
- Create: `src/features/models/components/LocalModelPanel.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/styles/index.css`

**Step 1: Write failing frontend tests**

Cover state labels/actions for absent, downloading, paused, verifying, installing, ready, failed and incompatible states. Test source selection, byte progress, insufficient-space messaging and confirmation before remove/update.

**Step 2: Verify RED**

Run: `npm test -- src/features/models/modelState.test.ts`

Expected: module is missing.

**Step 3: Implement the panel**

Keep `SettingsPage` as orchestration. The panel subscribes to backend events, restores persisted jobs on mount, exposes explicit controls and never clears existing model state merely because the page unmounts.

**Step 4: Verify GREEN**

Run focused tests, accessibility tests and `npm run build`.

**Step 5: Commit**

Commit message: `feat: add local GLM OCR model manager UI`

### Task 8: Integrate local runtime with durable OCR queue

**Files:**
- Create: `src-tauri/src/commands/local_ocr.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/features/ocr/ocrQueue.ts`
- Modify: `src/features/ocr/useOcrQueue.ts`
- Modify: `src/pages/OcrPage.tsx`
- Modify: `src/features/ocr/OcrQueuePanel.tsx`

**Step 1: Write failing tests**

Cover the new `local_glm` engine, installed-model preflight, queue recovery, cancel propagation, sidecar crash retry and preservation of completed pages. Test response normalization against a recorded llama-server fixture.

**Step 2: Verify RED**

Run focused frontend and Rust tests; confirm the engine/command is absent.

**Step 3: Implement integration**

Acquire one runtime lease per active queue, reuse the loaded model across pages, and persist outputs through the existing content-addressed artifact flow. A local runtime failure must leave Tesseract and remote providers usable.

**Step 4: Verify GREEN**

Run OCR queue tests, Rust local inference tests, all tests and production build.

**Step 5: Commit**

Commit message: `feat: run OCR queues through local llama cpp`

### Task 9: Real compatibility gate

**Files:**
- Create: `src-tauri/tests/local_glm_ocr_compat.rs`
- Create: `src-tauri/tests/fixtures/glm-ocr/manifest.json`
- Create: `docs/GLM_OCR_COMPATIBILITY.md`
- Modify: `docs/VALIDATION.md`

**Step 1: Add opt-in tests**

Use environment variables for the real runtime/model paths so CI does not download 1.44 GB. Compare a fixed multilingual/formula/table image corpus for non-empty output, required fragments, cancellation latency, warm reuse and memory cleanup.

**Step 2: Run against pinned llama-server**

Record llama.cpp release/commit, model hashes, CPU/GPU, peak memory, cold start and per-page timings. Compatibility is accepted only after the corpus passes.

**Step 3: Commit**

Commit message: `test: establish GLM OCR compatibility gate`

### Task 10: Direct libllama/mtmd backend

**Files:**
- Create: `src-tauri/native/llama_bridge/CMakeLists.txt`
- Create: `src-tauri/native/llama_bridge/quiz_llama.h`
- Create: `src-tauri/native/llama_bridge/quiz_llama.cpp`
- Create: `src-tauri/src/services/local_inference/libllama.rs`
- Create: `src-tauri/src/services/local_inference/executor.rs`
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/services/local_inference/mod.rs`

**Step 1: Write failing ABI and backend contract tests**

Define a narrow project-owned C ABI for create/load/recognize/cancel/unload/error-free. Test version mismatch, null/error handling, cancellation and one-thread-at-a-time model access. Re-run the same `LocalInferenceBackend` contract suite used by `LlamaServerBackend`.

**Step 2: Verify RED**

Build with `--features libllama`; expect missing bridge symbols/backend.

**Step 3: Implement the smallest bridge**

Pin the same llama.cpp b9716 source/headers as the compatibility backend. Wrap unstable llama/mtmd APIs behind `quiz_llama.h`; never expose upstream structs to Rust. Run all native inference on one dedicated executor thread so Tauri async tasks do not call the C API concurrently. Convert callbacks into owned buffers and translate failures into `AppError` without unwinding across FFI.

**Step 4: Verify GREEN**

Run ABI tests, backend contract tests and the real compatibility corpus with both backends. Keep `llama-server` as default until output requirements, cancellation and cleanup all pass.

**Step 5: Switch default with fallback**

Select `LibLlamaBackend` by default only on validated targets. Keep `LlamaServerBackend` behind a runtime fallback flag for one release cycle and record fallback reasons locally without OCR content.

**Step 6: Commit**

Commit message: `feat: link libllama for in-process GLM OCR`

### Task 11: Full verification and documentation

**Files:**
- Modify: `docs/VALIDATION.md`
- Modify: `README.md`
- Modify: `docs/TECHNICAL_DESIGN.md`
- Modify: `docs/adr/0002-embed-llama-cpp-runtime-download-glm-ocr-model.md`

**Step 1: Run automated verification**

Run:

```text
npm test
npm run build
cargo fmt --all --check
cargo check
cargo test
git diff --check
```

**Step 2: Run release checks**

Verify a model-free installer, first-run download from each source, interrupted resume, offline restart, OCR queue recovery, model repair/delete, sidecar backend and libllama backend on the fixed corpus.

**Step 3: Update status**

Mark ADR-0002 Accepted only after the Windows compatibility gate and model-source mirror are reproducible. Document unsupported platforms/hardware explicitly.

**Step 4: Commit**

Commit message: `docs: validate local GLM OCR runtime`

