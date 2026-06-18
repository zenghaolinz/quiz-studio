import type { OcrResult } from "../../domain/ocr";
import { invokeCommand } from "../../lib/tauri";

interface PersistedOcrArtifacts {
  sourceAssetId: string;
  rawAssetId: string;
  markdownAssetId: string;
}

export async function persistLocalOcrArtifacts(
  sourceDataUrl: string,
  sourceName: string,
  result: OcrResult,
): Promise<PersistedOcrArtifacts> {
  return invokeCommand<PersistedOcrArtifacts>("persist_local_ocr_artifacts", {
    sourceDataUrl,
    sourceName,
    engine: result.engine,
    rawJson: result.rawJson ?? {},
    markdown: result.markdown,
  });
}
