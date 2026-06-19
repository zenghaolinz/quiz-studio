export type OcrQueueEngine = "tesseract" | "glm" | "local_glm";
export type OcrQueueStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface OcrQueueItem {
  id: string;
  sourceAssetId: string;
  sourceName: string;
  status: OcrQueueStatus;
  markdown?: string;
  error?: string;
}

export interface OcrQueue {
  version: 1;
  id: string;
  engine: OcrQueueEngine;
  providerId: string;
  items: OcrQueueItem[];
  updatedAt: string;
}

export interface OcrQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = "quiz-studio.ocr-queue.v1";
const defaultStorage = (): OcrQueueStorage => window.localStorage;

function read(storage: OcrQueueStorage): OcrQueue | null {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as OcrQueue | null;
    return parsed?.version === 1 && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function save(queue: OcrQueue, storage: OcrQueueStorage): OcrQueue {
  const next = { ...queue, updatedAt: new Date().toISOString() };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function createOcrQueue(
  engine: OcrQueueEngine,
  providerId: string,
  sources: Array<{ sourceAssetId: string; sourceName: string }>,
  storage: OcrQueueStorage = defaultStorage(),
): OcrQueue {
  if (sources.length === 0) throw new Error("OCR 队列至少需要一个文件或页面");
  return save({
    version: 1,
    id: crypto.randomUUID(),
    engine,
    providerId,
    items: sources.map((source) => ({ ...source, id: crypto.randomUUID(), status: "pending" })),
    updatedAt: "",
  }, storage);
}

export function loadOcrQueue(storage: OcrQueueStorage = defaultStorage()): OcrQueue | null {
  try {
    const parsed = read(storage);
    if (!parsed) return null;
    const recovered = {
      ...parsed,
      items: parsed.items.map((item) => item.status === "running" ? { ...item, status: "pending" as const } : item),
    };
    if (recovered.items.some((item, index) => item.status !== parsed.items[index].status)) save(recovered, storage);
    return recovered;
  } catch {
    return null;
  }
}

export function updateOcrQueueItem(
  queueId: string,
  itemId: string,
  patch: Partial<Pick<OcrQueueItem, "status" | "markdown" | "error">>,
  storage: OcrQueueStorage = defaultStorage(),
): OcrQueue | null {
  const queue = read(storage);
  if (!queue || queue.id !== queueId) return null;
  return save({
    ...queue,
    items: queue.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
  }, storage);
}

export function clearOcrQueue(storage: OcrQueueStorage = defaultStorage()): void {
  storage.removeItem(STORAGE_KEY);
}
