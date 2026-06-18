import { describe, expect, it } from "vitest";
import type { ImportDraft } from "../../import-core/types/question-draft";
import { clearImportDraft, loadImportDraft, saveImportDraft, type StorageLike } from "./importDraftPersistence";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const draft: ImportDraft = {
  id: "draft-1",
  sourceFileId: "markdown-1",
  sourceName: "scan.png",
  sourceType: "markdown",
  sourceAssets: { sourceAssetId: "source-1", markdownAssetId: "markdown-1" },
  blocks: [],
  questions: [],
  warnings: [],
  status: "needs_review",
};

describe("import draft persistence", () => {
  it("restores the latest unfinished draft", () => {
    const storage = memoryStorage();
    saveImportDraft(draft, storage);
    expect(loadImportDraft(storage)).toEqual(draft);
  });

  it("only clears when explicitly requested", () => {
    const storage = memoryStorage();
    saveImportDraft(draft, storage);
    clearImportDraft(storage);
    expect(loadImportDraft(storage)).toBeNull();
  });

  it("ignores malformed storage", () => {
    const storage = memoryStorage();
    storage.setItem("quiz-studio.import-draft.v1", "not-json");
    expect(loadImportDraft(storage)).toBeNull();
  });
});
