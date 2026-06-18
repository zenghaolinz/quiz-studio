import type { ProviderConfig } from "../../domain/ocr";

export function currentModelLabel(providers: ProviderConfig[]): string {
  return providers.find((provider) => provider.kind === "llm" && provider.enabled)?.model.trim()
    || "未配置模型";
}
