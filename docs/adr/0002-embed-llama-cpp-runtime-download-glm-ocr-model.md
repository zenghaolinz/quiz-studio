# ADR-0002：直接内置 llama.cpp Sidecar，按需下载 GLM-OCR GGUF

## 状态

Proposed

## 背景

Quiz Studio 需要无需用户安装开发环境的本地 GLM-OCR，同时不能把模型权重塞进每个安装包。应用本身已经管理下载、任务、附件和生命周期，因此再内置一套完整的 Ollama 模型管理与服务层会产生职责重叠。

llama.cpp 已于 2026-02-18 合并 GLM-OCR 支持，包括 GLM4/MTP 文本层、视觉 `mtmd` 和 HF→GGUF 转换。`ggml-org/GLM-OCR-GGUF` 已提供可由 `llama-server` 直接加载的 Q8/F16 主模型和视觉 mmproj。

## 决策

应用随平台安装包分发固定提交构建的 `llama-server` 及所需运行库，由 Rust `SidecarManager` 按需启动并只绑定回环随机端口。首版下载约 950 MB 的 Q8 主模型与约 484 MB 的 Q8 mmproj。

Hugging Face 使用 `ggml-org/GLM-OCR-GGUF` 固定 revision；魔搭使用 Quiz Studio 发布流程镜像的相同 GGUF 制品。两个源必须匹配应用内 SHA-256 清单。魔搭官方 Safetensors 不在用户机器上转换，以免重新引入 Python/转换依赖。

首版提供整页 GLM-OCR 推理并复用现有 PDF 分页和 OCR 队列。PP-DocLayout-V3 两阶段流水线以后作为独立可选组件评估。

## 影响

### 正面

- 不安装或嵌套第二个桌面程序，也不重复 Ollama 的模型管理层；
- 进程、端口、上下文、线程和 GPU offload 均由 Quiz Studio 直接控制；
- CPU/GPU 跨平台路径明确，运行时比 Python/PyTorch 方案紧凑；
- Q8 + mmproj 约 1.44 GB，显著小于约 2.65 GB 的原始 BF16 Safetensors；
- 现有远程 Provider 与本地 Tesseract 不受影响。

### 负面

- 需要固定、构建和测试各平台 llama.cpp 制品；
- 需要维护 Hugging Face→魔搭的同哈希 GGUF 发布镜像；
- llama.cpp 的 GLM-OCR 支持较新，升级前必须执行图像回归集；
- 首版整页路径不具备官方 SDK 完整的布局检测与区域并行能力。

### 中性

- 运行时升级跟随应用发布，模型升级由用户在应用内确认；
- 将来可以从 `llama-server` 进程切换为直接链接 libllama，而不改变上层 ModelManager/OCR 队列接口。

## 备选方案

- **内置 Ollama**：成熟但重复模型下载、服务和生命周期职责，多一层故障面。
- **直接链接 libllama**：长期最紧凑，但首版会把 C ABI、异步调度和崩溃隔离复杂度带入 Tauri 主进程；先用 sidecar 隔离。
- **内置 Python + PyTorch/Transformers**：直接消费 Safetensors，但平台和 GPU 依赖过重。
- **内置 vLLM/SGLang**：适合 GPU 服务器，不适合作为 Windows/CPU 桌面默认方案。

## 参考

- [详细设计](../plans/2026-06-19-glm-ocr-sidecar-design.md)
- [llama.cpp GLM-OCR 支持 PR](https://github.com/ggml-org/llama.cpp/pull/19677)
- [GLM-OCR GGUF](https://huggingface.co/ggml-org/GLM-OCR-GGUF)
- [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/)

