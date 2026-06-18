import { describe, expect, it } from "vitest";
import { createOcrImportDraft, suggestedBankName } from "./ocrDraft";

describe("createOcrImportDraft", () => {
  it("converts OCR markdown and retains all asset ids", () => {
    const draft = createOcrImportDraft({
      engine: "tesseract_builtin",
      markdown: "1. 地球是圆的吗？\n答案：对",
      rawJson: { confidence: 99 },
      warnings: [],
      elapsedMs: 10,
      sourceAssetId: "source-1",
      rawAssetId: "raw-1",
      markdownAssetId: "markdown-1",
    }, "地理练习.png");

    expect(draft.sourceFileId).toBe("markdown-1");
    expect(draft.sourceName).toBe("地理练习.png");
    expect(draft.sourceAssets).toEqual({
      sourceAssetId: "source-1",
      rawAssetId: "raw-1",
      markdownAssetId: "markdown-1",
    });
    expect(draft.questions).toHaveLength(1);
  });

  it("suggests a readable new bank name", () => {
    expect(suggestedBankName("期末试卷.scan.png")).toBe("期末试卷.scan 题库");
  });
});
