# 验证记录

最近一次验证：2026-06-17（Windows 开发机，实际执行）

## 已完成验证（本轮在 Windows 实跑）

### 前端
- `npm install`：通过。注意：原 `package-lock.json` 的 `resolved` URL 指向不可达的内网 artifactory
  （`packages.applied-caas-gateway1.internal.api.openai.org`），npm 会绕过 registry 直接拉取这些地址而失败。
  已备份为 `package-lock.json.internal-bak` 并删除，改用 npmmirror（用户 `.npmrc` 已配置）重新生成。
- `npm run test`：通过，评分核心 2 项测试全部成功。
- `npm run build`：通过，React/Vite 生产构建成功，Markdown/Tesseract 等已按需分包。

### Rust / Tauri 后端
- `cargo check`：通过。需先激活 MSVC 环境（见下方“MSVC 环境”）。首次编译约 23s。
- `cargo test`：通过，5 项单测全部成功（glm_ocr ×2、db CRUD ×2、secret store ×1）。
- `npm run tauri dev`：通过，应用窗口正常启动，无 panic。

### 运行时
- SQLite 数据库在 `%APPDATA%\com.quizstudio.desktop\quiz-studio.sqlite3` 正确创建。
- 全部 8 张表（含 FTS5 影子表）与索引迁移成功；`journal_mode=wal` 生效。
- 数据库路径（Tauri `app_data_dir`）解析正确。
- 重启应用后已写入数据保留、迁移幂等（`IF NOT EXISTS`），无 "table already exists" 错误。
- API Key 凭据存储（keyring → Windows Credential Manager）往返实测可用。

## 本轮修复的问题

1. **lockfile 被内网镜像污染** → 删除并基于 npmmirror 重新生成（见上）。
2. **`bundle.icon` 为空 + 缺 `icons/icon.ico`** → tauri-build 在 Windows 生成资源文件时硬性失败。
   已用 `scripts/make-icon-source.cjs` 生成品牌占位 PNG，`npx tauri icon` 产出完整图标集，
   并在 `tauri.conf.json` 的 `bundle.icon` 引用。
3. **keyring 未启用平台原生后端** → keyring 3.x 把 `windows-native` 设为非默认 feature；
   原配置 `keyring = "3"` 导致 `set` 表面成功、`get` 返回 `NoEntry`，API Key 实际无法持久化。
   已改为按 `target.cfg` 启用各平台原生后端（windows-native / apple-native / linux-native-sync-persistent）。

## 尚待验证 / 已知风险

- **Tesseract.js 在当前 CSP 下能否运行**：`tauri.conf.json` 的 CSP 为 `default-src 'self'`，
  未授予 `script-src 'wasm-unsafe-eval'`，WASM 执行很可能被拦截；且 `chi_sim` 语言数据走 CDN
  （tessdata.projectnaptha.com），离线不可用。OCR 页面留待 v0.4，届时需在真实窗口实测并据此调整 CSP
  与语言数据托管方式。
- **React ↔ Tauri IPC 全链路**：命令注册、参数 camelCase↔snake_case 转换、`input` 单参结构体均已逐行核对一致；
  数据库 CRUD 与凭据存储的后端逻辑已由单测覆盖。但前端 invoke 在原生窗口的实际往返尚未经 UI 点击验证。
- **Windows 安装包构建**（`tauri build`，release 模式）：尚未执行。
- **开发版 / 生产版资源路径一致性**：dev 用 `http://localhost:1420`，prod 用 `../dist`，均为标准 Tauri 配置；
  `dist` 已由 `npm run build` 生成。完整一致性以 `tauri build` 产物为准，留待发布版。

## MSVC 环境（在 Git Bash 中编译 Rust 的方法）

当前 shell 未挂载 MSVC。`cl.exe` / 真 `link.exe` 位于
`C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools`（另有 VS 2022 Community）。

> ⚠️ 重要：不要用 `.bat` 脚本启动——`.bat` 里的中文路径 `D:\项目` 在 cmd 的默认 GBK 代码页下会被读成乱码，
> 导致 `cd` 失败、npm 在错误目录运行。改用下面的 **PowerShell 脚本**：脚本里不含任何中文路径字面量
> （项目根由脚本自身位置推算），彻底避开 PowerShell 5.1 / cmd 的编码问题。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\项目\quiz_studio_foundation\src-tauri\run-dev.ps1"    # 启动桌面应用
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\项目\quiz_studio_foundation\src-tauri\run-check.ps1"  # cargo check
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\项目\quiz_studio_foundation\src-tauri\run-test.ps1"   # cargo test
```

启动桌面应用必须用 `run-dev.ps1`（即 `npm run tauri dev`），它会编译 Rust 并打开原生 WebView2 窗口。
若只跑 `npm run dev`，只会启动前端 vite，在浏览器里 `isTauriRuntime()` 为 false，
导入/设置等功能按钮会被禁用（界面会提示“需要在 Tauri 桌面运行时中测试”）。

若 GLM-OCR SDK Server 的实际响应字段与适配器示例不同，只需要修改 `src-tauri/src/services/glm_ocr.rs`
中的 `extract_markdown`，无需改动题库或答题模块。
