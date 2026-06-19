import { useEffect, useRef, useState } from "react";
import type { OcrProgress, OcrResult } from "../../domain/ocr";
import { isTauriRuntime } from "../../lib/tauri";
import { getOcrSourceDataUrl, importOcrSource } from "./assetApi";
import { cancelGlmOcr, runGlmOcr } from "./glmOcrApi";
import { persistLocalOcrArtifacts } from "./ocrArtifactsApi";
import {
  clearOcrQueue,
  createOcrQueue,
  loadOcrQueue,
  updateOcrQueueItem,
  type OcrQueue,
  type OcrQueueEngine,
  type OcrQueueItem,
} from "./ocrQueue";
import { disposeTesseractWorker, recognizeWithTesseract } from "./tesseractEngine";
import { expandOcrFiles } from "./pdfPages";
import { beginLocalOcrQueue, finishLocalOcrQueue, runLocalGlmOcr } from "./localGlmApi";

export function useOcrQueue() {
  const [queue, setQueue] = useState<OcrQueue | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pauseRequested = useRef(false);
  const cancelRequested = useRef(false);
  const activeItem = useRef<OcrQueueItem | null>(null);

  useEffect(() => setQueue(loadOcrQueue()), []);

  async function prepare(files: File[], engine: OcrQueueEngine, providerId: string) {
    if (!isTauriRuntime()) throw new Error("多页 OCR 队列需要在桌面版中使用");
    setPreparing(true);
    setError(null);
    try {
      const expanded = await expandOcrFiles(files);
      const sources = [];
      for (const source of expanded) {
        const asset = await importOcrSource(source.dataUrl, source.sourceName);
        sources.push({ sourceAssetId: asset.id, sourceName: source.sourceName });
      }
      const next = createOcrQueue(engine, providerId, sources);
      setQueue(next);
      return next;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      throw caught;
    } finally {
      setPreparing(false);
    }
  }

  async function recognize(item: OcrQueueItem, current: OcrQueue): Promise<OcrResult> {
    const sourceDataUrl = await getOcrSourceDataUrl(item.sourceAssetId);
    if (cancelRequested.current) throw new Error("OCR 任务已取消");
    if (current.engine === "glm") {
      return runGlmOcr(current.providerId, sourceDataUrl, item.sourceName, undefined, item.id);
    }
    if (current.engine === "local_glm") {
      return runLocalGlmOcr(current.id, item.id, sourceDataUrl, item.sourceName);
    }
    const result = await recognizeWithTesseract(sourceDataUrl, { onProgress: setProgress });
    try {
      Object.assign(result, await persistLocalOcrArtifacts(sourceDataUrl, item.sourceName, result));
    } catch (caught) {
      result.warnings.push(`识别成功，但本地附件保存失败：${caught instanceof Error ? caught.message : String(caught)}`);
    }
    return result;
  }

  async function start(sourceQueue = queue) {
    if (!sourceQueue || running) return;
    setRunning(true);
    setError(null);
    pauseRequested.current = false;
    cancelRequested.current = false;
    let current = sourceQueue;
    try {
      if (current.engine === "local_glm") {
        await beginLocalOcrQueue(current.id, current.providerId);
      }
      for (const item of current.items) {
        if (pauseRequested.current || cancelRequested.current) break;
        if (item.status !== "pending" && item.status !== "failed") continue;
        activeItem.current = item;
        current = updateOcrQueueItem(current.id, item.id, { status: "running", error: undefined }) ?? current;
        setQueue(current);
        try {
          const result = await recognize(item, current);
          current = updateOcrQueueItem(current.id, item.id, {
            status: "completed",
            markdown: result.markdown,
            error: undefined,
          }) ?? current;
        } catch (caught) {
          current = updateOcrQueueItem(current.id, item.id, {
            status: cancelRequested.current ? "cancelled" : "failed",
            error: cancelRequested.current ? undefined : (caught instanceof Error ? caught.message : String(caught)),
          }) ?? current;
        }
        setQueue(current);
        activeItem.current = null;
        setProgress(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (sourceQueue.engine === "local_glm") {
        await finishLocalOcrQueue(sourceQueue.id).catch(() => false);
      }
      activeItem.current = null;
      setRunning(false);
      setQueue(loadOcrQueue());
    }
  }

  function pause() {
    pauseRequested.current = true;
  }

  async function cancel() {
    cancelRequested.current = true;
    pauseRequested.current = true;
    const active = activeItem.current;
    if (active) {
      if (queue?.engine === "glm" || queue?.engine === "local_glm") await cancelGlmOcr(active.id).catch(() => false);
      else await disposeTesseractWorker().catch(() => undefined);
    }
    let current = loadOcrQueue();
    if (!current) return;
    for (const item of current.items) {
      if (item.status === "pending" || item.status === "failed") {
        current = updateOcrQueueItem(current.id, item.id, { status: "cancelled", error: undefined }) ?? current;
      }
    }
    setQueue(current);
  }

  function retryCancelled() {
    let current = loadOcrQueue();
    if (!current) return;
    for (const item of current.items) {
      if (item.status === "cancelled" || item.status === "failed") {
        current = updateOcrQueueItem(current.id, item.id, { status: "pending", error: undefined }) ?? current;
      }
    }
    setQueue(current);
  }

  function remove() {
    clearOcrQueue();
    setQueue(null);
    setError(null);
  }

  return { queue, preparing, running, progress, error, prepare, start, pause, cancel, retryCancelled, remove };
}
