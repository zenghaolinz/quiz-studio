# Quiz Studio V1 Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐除正式安装包之外的首版功能，使题库管理、导入、刷题自测和 AI 辅助形成持久化闭环。

**Architecture:** 保持 React/TypeScript 前端经 Tauri IPC 调用 Rust 服务，SQLite 作为桌面端事实来源；浏览器模式保持同构 localStorage 仓库。复杂格式统一进入现有导入草稿管线，AI 只增强而不替代本地规则与人工确认。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri 2、Rust、rusqlite、Zod。

---

### Task 1: 题库可移植格式与搜索

**状态：已完成。** `.qbank` 恢复在桌面端以单一 SQLite 事务写入题库与全部题目，任一题目校验或写入失败会整体回滚。

**Files:**
- Create: `src/features/banks/portableBank.ts`
- Create: `src/features/banks/portableBank.test.ts`
- Modify: `src/features/banks/api.ts`
- Modify: `src/pages/BanksPage.tsx`

1. 先写 `.qbank` 序列化、版本校验、损坏数据拒绝和搜索测试并确认失败。
2. 实现最小可移植格式及纯函数搜索，确认测试通过。
3. 接入浏览器/桌面数据导出恢复 API 和界面操作。
4. 运行相关测试及完整前端测试。

### Task 2: 完整题目编辑与题库元数据编辑

**Files:**
- Modify: `src/domain/question.ts`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/banks.rs`
- Modify: `src-tauri/src/commands/questions.rs`
- Modify: `src/features/banks/api.ts`
- Create: `src/features/banks/components/QuestionEditor.tsx`
- Modify: `src/pages/BanksPage.tsx`

1. 先写 SQLite 更新、校验和不存在记录测试并确认失败。
2. 实现题库及题目更新命令，保持更新时间和 FTS 数据一致。
3. 接入浏览器仓库和编辑界面。
4. 验证所有题型答案在编辑后可重新读取和评分。

### Task 3: 自测会话与结果分析

**Files:**
- Create: `src/domain/session.ts`
- Create: `src/domain/session.test.ts`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/commands/sessions.rs`
- Create: `src/features/sessions/api.ts`
- Modify: `src/pages/TestPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`

1. 先写会话评分、未答处理和恢复测试并确认失败。
2. 实现会话/作答持久化 IPC 与浏览器同构仓库。
3. 实现统一提交、结果页、错题筛选和未完成会话恢复。
4. 完成 Rust 与前端回归验证。

### Task 4: DOCX 与 PDF 导入

**Files:**
- Create: `src-tauri/src/services/document_import.rs`
- Create: `src-tauri/src/commands/document_import.rs`
- Modify: `src/features/import/api.ts`
- Modify: `src/features/import/pages/ImportSelectPage.tsx`

1. 以最小 DOCX、文本 PDF 和无文本 PDF fixture 写失败测试。
2. 实现文本提取并输出统一文档块；扫描 PDF 转交 OCR，不静默失败。
3. 接入现有规则切题和校正工作台。
4. 验证中文、分页、公式文本和错误提示。

### Task 5: AI 主观题评分

**状态：已完成。** 自动采用合法 AI 分数，保留可选人工调分，并持久化评分明细。

**Files:**
- Modify: `src-tauri/src/services/ai.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Create: `src/features/ai/components/AiGradingPanel.tsx`
- Modify: `src/pages/TestPage.tsx`

1. 先写结构化评分解析、边界分数和无评分点回退测试。
2. 实现评分命令、自动计分、可选调分和逐题持久化。
3. 显示 Provider、耗时、估算用量和可重试错误。
4. 验证 AI 失败不影响本地提交和已有作答。

### Task 6: 附件、任务恢复与收尾

**状态：已完成。** OCR 内容寻址附件仓库、扫描 PDF/多图片持久化队列、重启恢复、运行中取消、可恢复导入草稿、AI 批次检查点续做和可访问性收尾均已完成。

**Files:**
- Modify: `src-tauri/src/db/schema.sql`
- Create: `src-tauri/src/services/assets.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src/pages/OcrPage.tsx`
- Modify: `docs/VALIDATION.md`

1. 为附件路径限制、哈希去重、任务断点和取消语义写失败测试。
2. 实现工作区资源仓库与 OCR/AI 任务状态恢复。
3. 补充键盘操作、焦点、空状态和错误状态。
4. 运行 `npm test`、`npm run build`、`cargo fmt --check`、`cargo check`、`cargo test`，记录剩余外部服务手工验收项。
