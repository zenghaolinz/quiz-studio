import type { ExplanationStyle } from "../../domain/ai";

export interface AiBatchCheckpoint {
  bankId: string;
  providerId: string;
  style: ExplanationStyle;
  concurrency: number;
  pendingQuestionIds: string[];
  failed: number;
  updatedAt: string;
}

export interface CheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type NewCheckpoint = Omit<AiBatchCheckpoint, "updatedAt">;
const key = (bankId: string) => `quiz-studio.ai-explanation-batch.${bankId}.v1`;
const defaultStorage = (): CheckpointStorage => window.localStorage;

export function loadBatchCheckpoint(
  bankId: string,
  storage: CheckpointStorage = defaultStorage(),
): AiBatchCheckpoint | null {
  try {
    const parsed = JSON.parse(storage.getItem(key(bankId)) ?? "null") as Partial<AiBatchCheckpoint> | null;
    if (!parsed || parsed.bankId !== bankId || typeof parsed.providerId !== "string" || !Array.isArray(parsed.pendingQuestionIds)) return null;
    return parsed as AiBatchCheckpoint;
  } catch {
    return null;
  }
}

export function saveBatchCheckpoint(
  checkpoint: NewCheckpoint,
  storage: CheckpointStorage = defaultStorage(),
): AiBatchCheckpoint {
  const saved = { ...checkpoint, pendingQuestionIds: [...new Set(checkpoint.pendingQuestionIds)], updatedAt: new Date().toISOString() };
  storage.setItem(key(checkpoint.bankId), JSON.stringify(saved));
  return saved;
}

export function updateBatchCheckpoint(
  bankId: string,
  questionId: string,
  failed: boolean,
  storage: CheckpointStorage = defaultStorage(),
): AiBatchCheckpoint | null {
  const current = loadBatchCheckpoint(bankId, storage);
  if (!current) return null;
  const pendingQuestionIds = failed
    ? current.pendingQuestionIds
    : current.pendingQuestionIds.filter((id) => id !== questionId);
  if (pendingQuestionIds.length === 0) {
    clearBatchCheckpoint(bankId, storage);
    return null;
  }
  return saveBatchCheckpoint({ ...current, pendingQuestionIds, failed: current.failed + (failed ? 1 : 0) }, storage);
}

export function clearBatchCheckpoint(
  bankId: string,
  storage: CheckpointStorage = defaultStorage(),
): void {
  storage.removeItem(key(bankId));
}
