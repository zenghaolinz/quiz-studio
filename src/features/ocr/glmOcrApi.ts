import type { OcrResult, ProviderConfig, UpsertProviderInput } from "../../domain/ocr";
import { invokeCommand } from "../../lib/tauri";

export async function listProviders(): Promise<ProviderConfig[]> {
  return invokeCommand<ProviderConfig[]>("list_provider_configs");
}

export async function upsertProvider(
  input: UpsertProviderInput,
): Promise<ProviderConfig> {
  return invokeCommand<ProviderConfig>("upsert_provider_config", { input });
}

export async function runGlmOcr(
  providerId: string,
  imageDataUrl: string,
  prompt = "请识别文档内容并输出结构清晰的 Markdown；数学公式使用 LaTeX，化学式尽量保持原始符号。",
): Promise<OcrResult> {
  return invokeCommand<OcrResult>("run_glm_ocr", {
    providerId,
    imageDataUrl,
    prompt,
  });
}
