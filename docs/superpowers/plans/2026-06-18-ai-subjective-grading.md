# AI Subjective Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reviewable AI grading for subjective test answers without growing page components or allowing model output to directly change scores.

**Architecture:** A pure grading domain validates drafts and confirmed grades. Tauri AI services return drafts only; a feature component collects confirmation; session persistence stores confirmed grading details. Test pages remain orchestration-only.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, rusqlite, serde

---

### Task 1: Architecture guard and practice split

**Files:**
- Create: `src/architecture.test.ts`
- Create: `src/features/practice/components/PracticeQuestionCard.tsx`
- Modify: `src/pages/PracticePage.tsx`

- [x] Add a failing 300-line page boundary test.
- [x] Extract practice question interaction and rendering.
- [x] Run architecture, frontend and build verification.

### Task 2: Grading domain

**Files:**
- Create: `src/domain/grading.ts`
- Test: `src/domain/grading.test.ts`

- [x] Test rejection of negative, over-max and non-finite scores.
- [x] Implement draft validation and confirmed-grade application to session results.
- [x] Verify pending subjective questions become graded only after confirmation.

### Task 3: Provider grading service

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/services/ai.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Test fenced JSON parsing, rubric items and score bounds in Rust.
- [x] Add a grading prompt and reuse existing Provider protocol adapters.
- [x] Expose `generate_subjective_grade` without database mutation.

### Task 4: Confirmed grade persistence

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src/features/sessions/api.ts`
- Modify: `src/features/sessions/studyWorkspace.ts`

- [x] Add schema migration 2 with `ai_grading_json` on attempts.
- [x] Round-trip confirmed grade details in SQLite and browser storage.
- [x] Keep old sessions readable when grading details are absent.

### Task 5: Small grading UI slice

**Files:**
- Create: `src/features/ai/gradingApi.ts`
- Create: `src/features/ai/components/AiGradingPanel.tsx`
- Create: `src/features/test/components/TestResultPanel.tsx`
- Modify: `src/pages/TestPage.tsx`

- [x] Add Provider selection, generate/retry and score adjustment to the grading panel.
- [x] Apply a valid AI score automatically and keep manual adjustment optional.
- [x] Extract result rendering so `TestPage.tsx` stays below 300 lines.

### Task 6: Verification

**Files:**
- Modify: `docs/VALIDATION.md`

- [x] Run `git diff --check`, `npm test`, `npm run build`, `cargo fmt --check`, `cargo check`, and `cargo test`.
- [ ] Browser-test AI failure isolation and confirmed-grade persistence.
