# 验证记录

## 2026-06-18：DOCX/PDF 导入批次

- DOCX：从 OOXML 正文按段落和表格顺序提取文字，进入现有规则切题与人工校正工作台。
- PDF：逐页提取文本并把页码传递到 `DocumentBlock` 和题目来源范围。
- 扫描型 PDF：没有可提取文字时返回 OCR 分流提示，不生成空题库。
- 损坏的 DOCX/PDF 会被明确拒绝。
- 使用真实生成并视觉核对的中文 DOCX、文本 PDF、无文字 PDF 作为回归 fixture。
- 当前限制：DOCX 的可靠分页信息无法从 OOXML 正文直接恢复，因此按连续文本显示；浏览器开发模式仍只读取 TXT/Markdown，DOCX/PDF 使用桌面端 Rust 解析。

## 2026-06-18：自测闭环批次

- 新增自测会话领域评分：客观题统一计分，未答单独统计，主观题保持待批改状态。
- 新增 SQLite/Tauri 与浏览器 localStorage 同构会话存储。
- 自测作答自动保存，重新进入同一题库可恢复当前题号、作答及显示答案状态。
- 统一提交后显示正确、错误、未答、待批改数量，并支持只看错题和未答。
- 本地浏览器流程验证：示例题库进入自测、作答、翻页、刷新后重新进入并恢复到第 2 题，已答数量保持为 1/2。
- 自动化验证：前端 6 个测试文件共 34 项通过；Rust 共 17 项测试通过；生产构建通过。

最近一次验证：2026-06-17

## v0.2.0 本轮实际验证

当前交付环境已执行：

### 前端与共享逻辑

- `npm install`：通过。
- `npx tsc -b`：通过（由 `npm run build` 执行）。
- `npx vitest run`：通过，共 4 个测试文件、27 项测试。
- `npm run build`：通过，Vite 生产构建成功，共转换 346 个模块。
- SourcePreview 样式冲突静态检查：通过，不再把 `DocumentBlock.kind="option"` 直接输出为全局 `.option` class。

测试覆盖包括：

- 题目评分核心；
- TXT/Markdown 规则切题与导入校验；
- 导入草稿 reducer；
- AI Provider 预设基本完整性。

### Rust / Tauri 后端

当前交付容器没有安装 Rust/Cargo，因此 v0.2.0 新增的 AI 命令和 HTTP 适配器**未在本环境执行**：

- `cargo fmt --check`：未执行；
- `cargo check`：未执行；
- `cargo test`：未执行；
- `npm run tauri:dev`：未执行。

v0.1.2 基线此前已在用户 Windows 开发机完成 `cargo check`、`cargo test` 与 Tauri 窗口启动验证；但这不能替代 v0.2.0 新增 Rust 文件的重新编译，因此合并后仍必须在 Windows 本机执行下方命令。

## Windows 本机验收命令

```powershell
cd "D:\项目\quiz_studio_foundation"

npm install
npx tsc -b
npx vitest run
npm run build

powershell -NoProfile -ExecutionPolicy Bypass -File ".\src-tauri\run-check.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\src-tauri\run-test.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\src-tauri\run-dev.ps1"
```

## 手工验收清单

### 原始文档预览

1. 导入包含多道选择题的 Markdown。
2. 确认选项行不再逐字堆叠或互相覆盖。
3. 点击题干、选项、答案等任意属于该题的原文行，右侧定位到对应题目。
4. 缩放窗口并验证窄屏下原文面板仍正常换行。

### AI 解析

1. 在设置页选择厂商预设。
2. 填写真实模型名和 API Key，保存配置。
3. 点击“测试连接”。
4. 打开一个含缺失解析题目的题库。
5. 先执行单题生成，确认解析立即写入并可展开查看。
6. 执行批量生成，测试 1～4 并发和“完成当前请求后暂停”。
7. 重启应用，确认已经生成的解析仍保存在 SQLite。
8. 检查数学 LaTeX 和化学 `mhchem` 内容能正常渲染。

## 已知边界

- 当前仅支持 OpenAI Compatible 与 Anthropic Messages 两类文本模型协议；Gemini 使用其 OpenAI 兼容入口。
- 批量任务不会覆盖已有解析。
- 已成功题目会逐题持久化，但本版尚未建立独立的批量任务表，因此应用重启后不会恢复进度面板；重新点击时会继续扫描仍为空的题目。
- AI 输出会尝试解析结构化 JSON；若厂商忽略格式要求，则保存其纯文本/Markdown 内容。
- 模型生成内容可能存在事实错误，重要题库仍需人工抽查。
- Windows 安装包（`tauri build`）尚未在本轮构建。
