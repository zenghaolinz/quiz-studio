import type { OcrResult } from "../../domain/ocr";
import { invokeCommand } from "../../lib/tauri";

export const beginLocalOcrQueue = (queueId: string, modelId: string) =>
  invokeCommand<void>("begin_local_ocr_queue", { queueId, modelId });

export const runLocalGlmOcr = (
  queueId: string,
  taskId: string,
  imageDataUrl: string,
  sourceName: string,
) => invokeCommand<OcrResult>("run_local_glm_ocr", {
  queueId,
  taskId,
  imageDataUrl,
  sourceName,
});

export const finishLocalOcrQueue = (queueId: string) =>
  invokeCommand<boolean>("finish_local_ocr_queue", { queueId });
