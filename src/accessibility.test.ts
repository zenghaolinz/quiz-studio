import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("keyboard and assistive status contracts", () => {
  it("shows a focus-visible outline for interactive controls", () => {
    const css = source("src/styles/index.css");
    expect(css).toContain("button:focus-visible");
    expect(css).toContain("select:focus-visible");
  });

  it("exposes OCR progress and errors to assistive technology", () => {
    const ocr = source("src/pages/OcrPage.tsx");
    expect(ocr).toContain('role="progressbar"');
    expect(ocr).toContain("aria-valuenow");
    expect(ocr).toContain('role="alert"');
  });

  it("announces AI batch progress and failures", () => {
    const panel = source("src/features/ai/components/AiExplanationPanel.tsx");
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="alert"');
  });
});
