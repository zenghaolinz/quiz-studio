import { describe, expect, it } from "vitest";
import { AI_PROVIDER_PRESETS } from "./providerPresets";

describe("AI provider presets", () => {
  it("contains unique ids and editable base URLs", () => {
    const ids = AI_PROVIDER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(AI_PROVIDER_PRESETS.some((preset) => preset.id === "custom")).toBe(true);
    expect(AI_PROVIDER_PRESETS.filter((preset) => preset.id !== "custom").every((preset) => /^https?:\/\//.test(preset.baseUrl))).toBe(true);
  });

  it("does not expose OCR-only protocol as an LLM preset", () => {
    expect(AI_PROVIDER_PRESETS.every((preset) => preset.protocol !== "glm_sdk")).toBe(true);
  });
});
