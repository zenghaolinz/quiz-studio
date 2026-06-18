import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../../domain/ocr";
import { currentModelLabel } from "./currentModel";

const provider = (overrides: Partial<ProviderConfig>): ProviderConfig => ({
  id: "provider-a",
  name: "DeepSeek",
  kind: "llm",
  protocol: "openai_compatible",
  baseUrl: "https://api.example.com/v1",
  model: "deepseek-chat",
  enabled: true,
  createdAt: "2026-06-18T00:00:00Z",
  updatedAt: "2026-06-18T00:00:00Z",
  ...overrides,
});

describe("currentModelLabel", () => {
  it("shows the first enabled language model", () => {
    expect(currentModelLabel([
      provider({ enabled: false, model: "disabled" }),
      provider({ id: "active", model: "deepseek-chat" }),
    ])).toBe("deepseek-chat");
  });

  it("does not present OCR or disabled providers as the current model", () => {
    expect(currentModelLabel([provider({ kind: "ocr", model: "glm-ocr" })])).toBe("未配置模型");
    expect(currentModelLabel([])).toBe("未配置模型");
  });
});
