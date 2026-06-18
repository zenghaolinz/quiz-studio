# Automatic AI Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a valid AI subjective-grade response immediately while keeping retry and manual adjustment optional.

**Architecture:** The pure grading domain converts a validated draft into an applied grade using the suggested score by default. The grading panel persists that grade immediately after generation; result and session components consume the renamed neutral grade type.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2

---

### Task 1: Automatic grade domain

**Files:**
- Modify: `src/domain/grading.test.ts`
- Modify: `src/domain/grading.ts`

- [x] Add a failing test proving a draft becomes a grade with its suggested score without explicit confirmation.
- [x] Rename the persisted type to `SubjectiveGrade` and implement `applyGradingDraft`.
- [x] Verify grading domain tests pass.

### Task 2: Automatic grading UI

**Files:**
- Modify: `src/features/ai/components/AiGradingPanel.tsx`
- Modify: `src/features/test/components/TestResultPanel.tsx`
- Modify: `src/features/sessions/api.ts`
- Modify: `src/features/sessions/studyWorkspace.ts`
- Modify: `src/pages/TestPage.tsx`

- [x] Apply and persist the generated grade immediately.
- [x] Keep retry and manual score adjustment as optional actions.
- [x] Remove confirmation wording and obsolete type names.
- [x] Serialize concurrent grade persistence so multiple subjective scores cannot overwrite each other.

### Task 3: Verification

- [x] Run focused tests, frontend tests, production build, Rust tests and `git diff --check`.
