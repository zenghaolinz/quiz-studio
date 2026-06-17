import { createWorker, type Worker } from "tesseract.js";
import type { OcrProgress, OcrResult } from "../../domain/ocr";

let activeWorker: Worker | null = null;
let activeLanguageKey = "";

export interface TesseractOptions {
  languages?: string[];
  onProgress?: (progress: OcrProgress) => void;
}

async function getWorker(
  languages: string[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<Worker> {
  const languageKey = [...languages].sort().join("+");
  if (activeWorker && activeLanguageKey === languageKey) return activeWorker;

  if (activeWorker) {
    await activeWorker.terminate();
    activeWorker = null;
  }

  activeWorker = await createWorker(languages, 1, {
    logger: (message) => {
      onProgress?.({
        stage: message.status,
        progress: typeof message.progress === "number" ? message.progress : 0,
        message: message.status,
      });
    },
  });
  activeLanguageKey = languageKey;
  return activeWorker;
}

export async function recognizeWithTesseract(
  image: File | Blob | string,
  options: TesseractOptions = {},
): Promise<OcrResult> {
  const startedAt = performance.now();
  const languages = options.languages ?? ["chi_sim", "eng"];
  const worker = await getWorker(languages, options.onProgress);
  const { data } = await worker.recognize(image);

  return {
    engine: "tesseract_builtin",
    markdown: data.text.trim(),
    rawJson: {
      confidence: data.confidence,
      blocks: data.blocks,
    },
    warnings:
      data.confidence < 70
        ? ["基础 OCR 置信度较低，建议切换 GLM-OCR 或人工核对。"]
        : [],
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

export async function disposeTesseractWorker(): Promise<void> {
  if (!activeWorker) return;
  await activeWorker.terminate();
  activeWorker = null;
  activeLanguageKey = "";
}
