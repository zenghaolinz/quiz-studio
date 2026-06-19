# GLM-OCR 本地兼容性门禁

本门禁验证 Quiz Studio 内置的 llama.cpp CPU 运行时与外置 GLM-OCR GGUF 权重是否真正兼容。普通 `cargo test` 不会下载模型，也不会启动约 1.4 GB 的权重；发布候选版本必须显式运行真实门禁。

## 固定基线

- llama.cpp：`b9716`（Windows 冒烟输出 `9716 / db52540f7`）
- 模型：`glm-ocr-q8`
- 主模型 SHA-256：`45bc244a6446aff850521dc41f18bc8d7105ad5f0c2c8c28af04e7cc4f4d50b1`
- mmproj SHA-256：`9c4b58e33e316ed142eb5dcb41abec3844d3e6e5dc361ffb782c3fa9d175141f`
- 服务绑定：仅 `127.0.0.1`，随机空闲端口

## 运行方式

准备一张包含 `Quiz Studio`、公式 `x²` 和表格合计行的 PNG/JPEG/WebP 样张，然后执行：

```powershell
$env:QUIZ_STUDIO_LLAMA_SERVER = "C:\path\to\llama-server.exe"
$env:QUIZ_STUDIO_GLM_MODEL = "C:\path\to\GLM-OCR-Q8_0.gguf"
$env:QUIZ_STUDIO_GLM_MMPROJ = "C:\path\to\mmproj-GLM-OCR-Q8_0.gguf"
$env:QUIZ_STUDIO_GLM_FIXTURE = "C:\path\to\compatibility.png"
cargo test --test local_glm_ocr_compat -- --nocapture
```

测试覆盖：冷启动、同一进程热复用、必需文本片段、预取消延迟（小于 2 秒）和显式卸载。缺少 `QUIZ_STUDIO_LLAMA_SERVER` 时测试会明确跳过，保证普通 CI 不产生大模型下载。

## 发布判定

2026-06-19 已在 Intel Core i7-13700HX / 32 GB RAM / Windows x64 上使用 CPU 运行时通过真实门禁：冷启动加首次识别 `20.63s`，同进程热识别 `1.96s`，预取消低于 `2s`，卸载后状态为 `Stopped`。本轮未采集峰值内存，不能据此给出内存承诺。模型权重仍不在仓库或安装包中分发。

当前固定运行时在 Windows 上无法可靠打开含非 ASCII 字符的 GGUF 路径；真实门禁因此使用同盘 ASCII 路径硬链接。产品模型目录默认位于应用数据目录，后续仍应在运行时启动前检测路径可用性，并在必要时迁移到 ASCII 安全目录。

CUDA、Vulkan、Metal 等硬件加速版本后延。后续应根据设备探测选择经过单独签名和校验的运行时包，CPU 版本始终保留为兼容回退，不在本阶段动态编译用户机器上的二进制。
