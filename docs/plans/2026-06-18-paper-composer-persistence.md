# Paper Composer and Persistent Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom paper composition and preserve practice/test answers until the user explicitly clears answers or changes paper.

**Architecture:** Pure domain functions create and reconcile paper definitions. A shared React composer edits ranges, type quotas, exact selection and custom order. A synchronous local workspace store persists both modes, while test mode keeps its existing SQLite session mirror.

**Tech Stack:** React 19, TypeScript, Vitest, localStorage, existing Tauri commands

---

### Task 1: Paper composition domain

**Files:**
- Create: `src/domain/paper.ts`
- Create: `src/domain/paper.test.ts`

- [x] Write failing tests for range filtering, per-type quotas, exact selection ordering and deleted-question reconciliation.
- [x] Run `npm test -- src/domain/paper.test.ts` and confirm missing-module failure.
- [x] Implement `composePaper`, `moveQuestion`, and `reconcilePaperOrder` as pure functions.
- [x] Re-run the focused tests and confirm they pass.

### Task 2: Persistent study workspace

**Files:**
- Create: `src/features/sessions/studyWorkspace.ts`
- Create: `src/features/sessions/studyWorkspace.test.ts`

- [x] Write failing tests proving workspaces are isolated by mode/bank and survive save/load until explicit removal.
- [x] Run the focused test and confirm failure.
- [x] Implement versioned parse/save/remove helpers with an injectable Storage interface.
- [x] Re-run the focused test and confirm it passes.

### Task 3: Shared paper composer

**Files:**
- Create: `src/components/PaperComposer.tsx`
- Modify: `src/styles/index.css`

- [x] Build range and type-quota controls over the pure paper functions.
- [x] Add exact checkboxes plus up/down ordering controls.
- [x] Disable start when no questions are selected and show selected count.

### Task 4: Practice integration

**Files:**
- Modify: `src/pages/PracticePage.tsx`

- [x] Restore an existing practice workspace or show the composer on first entry.
- [x] Persist responses, confirmed answers, revealed answers, order and current index synchronously.
- [x] Add confirmed clear-answer and change-paper actions.

### Task 5: Test integration

**Files:**
- Modify: `src/pages/TestPage.tsx`
- Modify: `src/features/sessions/api.ts`

- [x] Restore local workspace before rendering and mirror it to the existing test session API.
- [x] Persist every answer without relying solely on the delayed SQLite timer.
- [x] Add clear-answer and change-paper actions without accidental cleanup on navigation.

### Task 6: Verification

**Files:**
- Modify: `docs/VALIDATION.md`

- [x] Run `git diff --check`, `npm test`, and `npm run build`.
- [x] Verify both modes in the browser: compose, answer, jump away, leave page, return, reload; verify clear/change-paper state helpers with automated tests.
- [x] Record exact verification results.
