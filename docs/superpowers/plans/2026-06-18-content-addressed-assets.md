# Content-Addressed Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist original OCR inputs and derived OCR outputs in a safe deduplicated local asset store, then route OCR Markdown into a recoverable import draft with explicit target-bank choice.

**Architecture:** `services/assets.rs` owns content hashing and confined filesystem access; `db/assets.rs` owns asset metadata. OCR commands compose those services but neither layer writes questions directly. Frontend OCR output becomes an import draft, and the existing review page remains the only route into a formal question bank.

**Tech Stack:** Rust, rusqlite, SHA-256, Tauri 2, React 19, TypeScript, Vitest

---

### Task 1: Asset metadata and migration

**Files:**
- Modify: `src-tauri/src/db/schema.sql`
- Modify: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/assets.rs`
- Modify: `src-tauri/src/models.rs`

- [x] Add a migration test expecting schema version 3 and an `assets` table with a unique SHA-256 index.
- [x] Run `cargo test db::tests::migrate_records_latest_version -- --exact` and verify it fails with version 2.
- [x] Add asset DTOs, schema version 3 migration, and an aggregate-specific repository with `get_asset`, `find_asset_by_hash`, and `insert_asset`.
- [x] Add repository round-trip and duplicate-hash tests, then run the focused Rust tests.

### Task 2: Confined content-addressed filesystem

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/services/assets.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/state.rs`

- [x] Write tests for deterministic SHA-256 paths, duplicate content, byte round-trip, oversize rejection, and traversal rejection.
- [x] Run `cargo test services::assets::tests -- --nocapture` and verify the new tests fail before implementation.
- [x] Add direct `sha2` and MIME inference dependencies, implement `AssetStore`, and inject it into `AppState` from the application data directory.
- [x] Run focused tests and `cargo fmt --check`.

### Task 3: Asset commands and OCR-derived artifacts

**Files:**
- Create: `src-tauri/src/commands/assets.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/ocr.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src/features/ocr/glmOcrApi.ts`
- Modify: `src/domain/ocr.ts`

- [x] Add a service test proving source, raw JSON, and Markdown assets retain their parent/role/provider/model metadata.
- [x] Implement `import_asset`, `get_asset_info`, and OCR commands that persist a source data URL plus both derived outputs.
- [x] Return asset IDs with `OcrResult` while retaining the existing Markdown and raw JSON fields.
- [x] Verify no arbitrary caller path is exposed through IPC.

### Task 4: Recoverable OCR import draft

**Files:**
- Create: `src/features/import/ocrDraft.ts`
- Create: `src/features/import/ocrDraft.test.ts`
- Create: `src/features/import/importDraftPersistence.ts`
- Create: `src/features/import/importDraftPersistence.test.ts`
- Modify: `src/pages/OcrPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/import/pages/ImportReviewPage.tsx`

- [x] Write a failing test that converts OCR Markdown into the existing import-core draft and preserves source asset IDs.
- [x] Write a failing storage test that restores the latest unfinished OCR draft after reload.
- [x] Implement pure conversion and persistence modules; keep OCR page limited to orchestration.
- [x] Add “校正并导入” from OCR results, default review mode to creating a new named bank, and retain the existing selector for appending to a bank.
- [x] Verify missing new-bank name or missing selected existing bank blocks import with an actionable error.

### Task 5: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/VALIDATION.md`
- Modify: `docs/plans/2026-06-18-v1-gap-closure.md`

- [x] Remove stale README claims that AI grading and OCR result persistence are absent.
- [x] Run `git diff --check`, `npm test`, `npm run build`, `cargo fmt --check`, `cargo check`, and `cargo test`.
- [x] Record external OCR Provider calls as a separate manual verification item; unit/integration tests must not consume API credit.
