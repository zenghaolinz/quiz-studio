import { describe, expect, it } from "vitest";
import {
  loadBatchCheckpoint,
  saveBatchCheckpoint,
  updateBatchCheckpoint,
  clearBatchCheckpoint,
  type CheckpointStorage,
} from "./batchCheckpoint";

function memoryStorage(): CheckpointStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("AI batch checkpoint", () => {
  it("restores an interrupted queue without completed questions", () => {
    const storage = memoryStorage();
    saveBatchCheckpoint({ bankId: "bank-a", providerId: "provider-a", style: "detailed", concurrency: 2, pendingQuestionIds: ["q1", "q2"], failed: 0 }, storage);
    updateBatchCheckpoint("bank-a", "q1", false, storage);

    expect(loadBatchCheckpoint("bank-a", storage)).toMatchObject({ pendingQuestionIds: ["q2"], failed: 0 });
  });

  it("tracks failures as retryable pending work and clears explicitly", () => {
    const storage = memoryStorage();
    saveBatchCheckpoint({ bankId: "bank-a", providerId: "provider-a", style: "concise", concurrency: 1, pendingQuestionIds: ["q1"], failed: 0 }, storage);
    updateBatchCheckpoint("bank-a", "q1", true, storage);
    expect(loadBatchCheckpoint("bank-a", storage)).toMatchObject({ pendingQuestionIds: ["q1"], failed: 1 });
    clearBatchCheckpoint("bank-a", storage);
    expect(loadBatchCheckpoint("bank-a", storage)).toBeNull();
  });
});
