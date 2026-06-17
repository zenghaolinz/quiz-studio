import type { ProviderConfig } from "../../domain/ocr";

export interface AiProviderPreset {
  id: string;
  name: string;
  protocol: ProviderConfig["protocol"];
  baseUrl: string;
  model: string;
  requiresApiKey: boolean;
  note: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: "openai", name: "OpenAI", protocol: "openai_compatible", baseUrl: "https://api.openai.com/v1", model: "", requiresApiKey: true, note: "填写账号当前可用的模型名称。" },
  { id: "anthropic", name: "Anthropic Claude", protocol: "anthropic_messages", baseUrl: "https://api.anthropic.com/v1", model: "", requiresApiKey: true, note: "使用原生 Messages API。" },
  { id: "gemini", name: "Google Gemini", protocol: "openai_compatible", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "", requiresApiKey: true, note: "通过 Gemini 的 OpenAI 兼容入口调用。" },
  { id: "deepseek", name: "DeepSeek", protocol: "openai_compatible", baseUrl: "https://api.deepseek.com", model: "", requiresApiKey: true, note: "使用 DeepSeek 官方 OpenAI 兼容接口。" },
  { id: "zhipu", name: "智谱 GLM", protocol: "openai_compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "", requiresApiKey: true, note: "填写智谱开放平台中可用的 GLM 模型。" },
  { id: "qwen", name: "阿里云百炼 / Qwen", protocol: "openai_compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "", requiresApiKey: true, note: "默认使用中国内地兼容入口。" },
  { id: "moonshot", name: "Moonshot / Kimi", protocol: "openai_compatible", baseUrl: "https://api.moonshot.cn/v1", model: "", requiresApiKey: true, note: "填写 Kimi 开放平台当前可用模型。" },
  { id: "volcengine", name: "火山方舟", protocol: "openai_compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "", requiresApiKey: true, note: "模型字段通常填写推理接入点 ID。" },
  { id: "ollama", name: "Ollama（本地）", protocol: "openai_compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "", requiresApiKey: false, note: "需先启动 Ollama，并填写本地已安装模型名。" },
  { id: "lm-studio", name: "LM Studio（本地）", protocol: "openai_compatible", baseUrl: "http://127.0.0.1:1234/v1", model: "", requiresApiKey: false, note: "需在 LM Studio 中启动本地 API Server。" },
  { id: "custom", name: "自定义兼容服务", protocol: "openai_compatible", baseUrl: "", model: "", requiresApiKey: true, note: "适用于代理、Coding Plan 或其他 OpenAI 兼容服务。" },
];
