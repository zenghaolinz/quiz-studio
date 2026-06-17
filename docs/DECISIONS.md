# Architecture Decision Records

## ADR-001：Tauri 2，而不是 Electron

状态：接受。

理由：PC 端使用系统 WebView，Rust 负责本地能力；能复用 Web 端 Markdown、KaTeX、PDF.js 等生态，并为 Android/iOS 留出迁移路径。

## ADR-002：前端不直接访问 SQLite

状态：接受。

理由：数据库迁移、校验、权限和错误处理集中在 Rust 后端，避免 UI 与表结构耦合，也降低未来同步与移动端适配成本。

## ADR-003：两级 OCR

状态：接受。

- 基础层：Tesseract.js，按需加载语言包，CPU 可运行。
- 高性能层：GLM-OCR，作为独立服务接入。

基础层只承担普通文本兜底，复杂公式、表格与版面交给 GLM-OCR 或人工校正。

## ADR-004：统一内容格式为 Markdown

状态：接受。

数学公式使用 LaTeX，化学式使用 mhchem；图片与附件使用内部资源引用。导入 HTML 不直接作为可信正式内容保存。

## ADR-005：API Key 不写入 SQLite

状态：接受。

桌面首版使用系统密钥库。移动端发布前替换为平台安全存储实现，但业务层只依赖 SecretStore 接口。
