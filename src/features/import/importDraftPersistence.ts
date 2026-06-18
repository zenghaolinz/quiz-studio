import type { ImportDraft } from "../../import-core/types/question-draft";

const STORAGE_KEY = "quiz-studio.import-draft.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function saveImportDraft(draft: ImportDraft, storage = defaultStorage()): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadImportDraft(storage = defaultStorage()): ImportDraft | null {
  const serialized = storage?.getItem(STORAGE_KEY);
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as Partial<ImportDraft>;
    if (typeof parsed.id !== "string" || !Array.isArray(parsed.questions) || !Array.isArray(parsed.blocks)) return null;
    return parsed as ImportDraft;
  } catch {
    return null;
  }
}

export function clearImportDraft(storage = defaultStorage()): void {
  storage?.removeItem(STORAGE_KEY);
}
