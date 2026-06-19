import { z } from "zod";

export const ocrEngineKindSchema = z.enum([
  "tesseract_builtin",
  "glm_sdk",
  "glm_openai_compatible",
  "local_glm_llama_cpp",
]);

export type OcrEngineKind = z.infer<typeof ocrEngineKindSchema>;

export interface OcrProgress {
  stage: string;
  progress: number;
  message?: string;
}

export interface OcrResult {
  engine: OcrEngineKind;
  markdown: string;
  rawJson?: unknown;
  warnings: string[];
  elapsedMs: number;
  sourceAssetId?: string;
  rawAssetId?: string;
  markdownAssetId?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: "ocr" | "llm";
  protocol: "glm_sdk" | "openai_compatible" | "anthropic_messages";
  baseUrl: string;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProviderInput {
  id?: string;
  name: string;
  kind: "ocr" | "llm";
  protocol: "glm_sdk" | "openai_compatible" | "anthropic_messages";
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKey?: string;
}
