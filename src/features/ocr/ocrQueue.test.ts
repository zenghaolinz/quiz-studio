import { describe, expect, it } from "vitest";
import {
  createOcrQueue,
  loadOcrQueue,
  updateOcrQueueItem,
  type OcrQueueStorage,
} from "./ocrQueue";

function memoryStorage(): OcrQueueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("OCR queue checkpoint", () => {
  it("restores running work as pending after restart", () => {
    const storage = memoryStorage();
    const queue = createOcrQueue("glm", "provider-a", [
      { sourceAssetId: "asset-1", sourceName: "scan-1.png" },
      { sourceAssetId: "asset-2", sourceName: "scan-2.png" },
    ], storage);
    updateOcrQueueItem(queue.id, queue.items[0].id, { status: "running" }, storage);

    expect(loadOcrQueue(storage)?.items.map((item) => item.status)).toEqual(["pending", "pending"]);
  });

  it("keeps completed output and supports cancelling pending pages", () => {
    const storage = memoryStorage();
    const queue = createOcrQueue("tesseract", "", [
      { sourceAssetId: "asset-1", sourceName: "page-1.png" },
      { sourceAssetId: "asset-2", sourceName: "page-2.png" },
    ], storage);
    updateOcrQueueItem(queue.id, queue.items[0].id, { status: "completed", markdown: "第一页" }, storage);
    updateOcrQueueItem(queue.id, queue.items[1].id, { status: "cancelled" }, storage);

    const restored = loadOcrQueue(storage);
    expect(restored?.items[0]).toMatchObject({ status: "completed", markdown: "第一页" });
    expect(restored?.items[1].status).toBe("cancelled");
  });

  it("does not reset a running item while updating another item", () => {
    const storage = memoryStorage();
    const queue = createOcrQueue("glm", "provider-a", [
      { sourceAssetId: "asset-1", sourceName: "scan-1.png" },
      { sourceAssetId: "asset-2", sourceName: "scan-2.png" },
    ], storage);
    updateOcrQueueItem(queue.id, queue.items[0].id, { status: "running" }, storage);
    const updated = updateOcrQueueItem(queue.id, queue.items[1].id, { status: "cancelled" }, storage);

    expect(updated?.items.map((item) => item.status)).toEqual(["running", "cancelled"]);
  });
});
