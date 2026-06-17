# Quiz Studio Foundation

一个面向 PC 首发、预留移动端的本地优先智能刷题软件骨架。

## 当前包含

- Tauri 2 + React 19 + TypeScript + Vite 8
- Rust 后端命令层，不允许前端直接执行 SQL
- SQLite 题库、题目、Provider、导入任务和作答记录基础表
- 单选、多选、判断、填空的本地评分核心
- Markdown + KaTeX + mhchem 渲染
- Tesseract.js 基础 OCR 页面
- GLM-OCR SDK 服务与 OpenAI-compatible 两种接入适配器
- 系统密钥存储适配器，API Key 不写入 SQLite
- 题库、刷题、自测、OCR、设置的基础界面

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

浏览器预览会使用演示题库，SQLite、密钥保存和 GLM-OCR 调用需要 Tauri 运行时。

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

- DOCX/PDF/TXT/MD 完整导入器
- 自动切题和导入校正工作台
- GLM-OCR 模型下载与 sidecar 生命周期管理
- AI 生成解析和主观题评分
- 完整测试会话持久化
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
