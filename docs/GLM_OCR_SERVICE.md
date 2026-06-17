# GLM-OCR 服务接入

## 推荐架构

Quiz Studio 不直接内嵌 Python、vLLM、SGLang 或模型权重。主程序只连接一个独立 OCR 服务。这样可以：

- 保持安装包轻量；
- 用户可把服务部署在本机、局域网 GPU 主机或云端；
- Windows、macOS、Linux 客户端共享同一协议；
- OCR 服务升级不要求重新发布桌面应用。

## 方案 A：官方 SDK Server（推荐）

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install "glmocr[server]"
python -m glmocr.server --log-level INFO
```

默认客户端地址：

```text
http://127.0.0.1:5002/glmocr/parse
```

应用发送：

```json
{
  "images": ["data:image/png;base64,..."]
}
```

该模式可以使用官方 SDK 的版面分析、区域并行识别和 Markdown/JSON 格式化能力。

## 方案 B：vLLM / SGLang OpenAI-compatible

把 Provider protocol 改为 `openai_compatible`，Base URL 填写到 `/v1` 或完整 `/chat/completions` 地址。该模式更接近原始模型调用；复杂文档建议仍在服务端增加版面分析。

## 后续模型管理器

正式版本应增加可选组件管理器：

1. 检测 Python、Docker、Ollama 或远程服务；
2. 下载模型与校验 SHA-256；
3. 写入独立组件目录；
4. 启动/停止 sidecar；
5. 健康检查与版本兼容检查；
6. 卸载时不影响用户题库数据。
