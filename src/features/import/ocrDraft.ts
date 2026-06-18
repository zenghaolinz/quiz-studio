import { parseImport } from "../../import-core";
import type { ImportDraft } from "../../import-core/types/question-draft";
import type { OcrResult } from "../../domain/ocr";

export function createOcrImportDraft(result: OcrResult, sourceName: string): ImportDraft {
  const sourceFileId = result.markdownAssetId ?? result.sourceAssetId ?? `ocr:${crypto.randomUUID()}`;
  return {
    ...parseImport("markdown", result.markdown, { sourceFileId, sourceName }),
    sourceAssets: {
      sourceAssetId: result.sourceAssetId,
      rawAssetId: result.rawAssetId,
      markdownAssetId: result.markdownAssetId,
    },
  };
}

export function suggestedBankName(sourceName?: string): string {
  const base = (sourceName ?? "OCR 导入").replace(/\.[^.]+$/, "").trim();
  return `${base || "OCR 导入"} 题库`;
}
