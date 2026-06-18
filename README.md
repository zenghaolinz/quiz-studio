# Quiz Studio v0.5.0

一个面向 PC 首发、预留移动端的本地优先智能刷题软件骨架。

## 当前包含

- Tauri 2 + React 19 + TypeScript + Vite 8
- Rust 后端命令层，不允许前端直接执行 SQL
- SQLite 题库、题目、Provider、导入任务和作答记录基础表
- 单选、多选、判断、填空的本地评分核心
- Markdown + KaTeX + mhchem 渲染
- Tesseract.js 基础 OCR 页面
- GLM-OCR SDK 服务与 OpenAI-compatible 两种接入适配器
- OCR 原图、原始 JSON 与 Markdown 的本地内容寻址附件仓库及可恢复导入草稿
- 系统密钥存储适配器，API Key 不写入 SQLite
- TXT/Markdown 规则切题、导入预览修正与批量写库
- 浏览器开发模式下使用 localStorage 验证完整导入链路
- 题库、刷题、自测、OCR、设置的基础界面
- 题库缺失解析扫描、单题生成与批量 AI 补全
- 自测主观题 AI 自动评分、逐评分点反馈和结果持久化
- 命名保存多套自定义试卷，在刷题和自测之间复用
- Provider 配置可删除，侧栏显示当前默认启用模型
- OpenAI、Anthropic、Gemini、DeepSeek、GLM、Qwen、Kimi、火山方舟、Ollama、LM Studio 等 Provider 预设

## 环境要求

- Node.js 22+
- Rust stable
- Windows 开发需要 Microsoft C++ Build Tools 与 WebView2

## 启动

```bash
npm install
npm run tauri:dev
```

只预览前端：

```bash
npm run dev
```

浏览器预览会使用 localStorage 保存开发数据，TXT/Markdown 导入、题库管理和刷题均可验证；SQLite、系统密钥保存和 GLM-OCR 调用仍需要 Tauri 运行时。


## 已修复的导入交互问题

- 修复导入草稿 reducer 无法处理首次 `load`，导致编辑、删除、选择答案等操作全部无效。
- 浏览器开发模式不再禁用“选择文件”，并增加本地题库仓库。
- 修复填空题在编辑后被错误保存为主观题答案。
- 修复删除选项后正确答案标签错位。
- 修复多选题选择第一个选项就立即判分的问题。

详见 `docs/FIX_REPORT.md`。

## 配置 GLM-OCR

推荐完整能力模式：运行官方 GLM-OCR SDK Server，然后在设置页填写：

```text
Provider ID: glm-ocr-local
Protocol: glm_sdk
URL: http://127.0.0.1:5002/glmocr/parse
Model: glm-ocr
```

服务端示例见 `docs/GLM_OCR_SERVICE.md`。

## 骨架的边界

这不是完整产品。以下内容只有接口或数据库预留，尚未完成：

- 多图片与扫描 PDF 的批量 OCR 队列（单图片 OCR 校正导入已支持）
- 更复杂的答案集中式题库、表格题库与组合题切分
- GLM-OCR 模型下载与 sidecar 生命周期管理
- 移动端适配和安全存储替换
- 自动更新、签名和正式安装包资源

## 目录

```text
src/                    React 前端
src-tauri/              Rust/Tauri 后端
src/domain/             可复用题目与评分模型
src/features/ocr/       OCR 适配器
docs/                   设计与部署文档
samples/                示例数据
```


## v0.2.0

修复 Markdown 原文预览中 `.option` 全局样式冲突导致的逐字堆叠，并加入题库 AI 解析补全功能。详见 `docs/V0.2_AI_EXPLANATION.md`。

## v0.3.0

- 题库和题目搜索、完整题目编辑；
- `.qbank` 导出与恢复；
- 自测自动保存、恢复、统一提交、客观题计分及错题筛选；
- 文本 DOCX/PDF 导入与扫描 PDF 的 OCR 分流；
- 前后端回归测试及 Windows Rust 编译验证。

## v0.4.0

- 刷题与自测支持题型筛选、题号直达以及顺序、乱序；
- 新增自定义组卷，可按题号范围、题型数量选题并精确调整题序；
- 持久保存试卷、当前位置、答案与判题状态，仅在用户确认清空答案或换卷时清理；
- 新增组卷、题序与工作区存储回归测试。

## v0.5.0

- AI 主观题自动评分、总分与逐题得分展示，并保存批次恢复检查点；
- OCR 原图、JSON 与 Markdown 内容寻址附件仓库及可恢复校正草稿；
- Provider 删除、当前模型提示、命名试卷保存与复用；
- 键盘焦点、进度与错误状态辅助技术播报。
