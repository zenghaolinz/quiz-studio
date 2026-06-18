import type { QuestionOrderMode } from "../../domain/questionNavigation";

export interface SavedPaper {
  id: string;
  bankId: string;
  name: string;
  questionOrder: string[];
  orderMode: QuestionOrderMode;
  updatedAt: string;
}

export interface PaperStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavePaperInput {
  id?: string;
  bankId: string;
  name: string;
  questionOrder: string[];
  orderMode: QuestionOrderMode;
}

const key = (bankId: string) => `quiz-studio.saved-papers.${bankId}.v1`;

function defaultStorage(): PaperStorage {
  return window.localStorage;
}

export function listSavedPapers(bankId: string, storage: PaperStorage = defaultStorage()): SavedPaper[] {
  try {
    const parsed = JSON.parse(storage.getItem(key(bankId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((paper): paper is SavedPaper => Boolean(
        paper && typeof paper === "object" &&
        typeof (paper as SavedPaper).id === "string" &&
        typeof (paper as SavedPaper).name === "string" &&
        Array.isArray((paper as SavedPaper).questionOrder),
      ))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function savePaper(input: SavePaperInput, storage: PaperStorage = defaultStorage()): SavedPaper {
  const name = input.name.trim();
  if (!name) throw new Error("试卷名称不能为空");
  if (input.questionOrder.length === 0) throw new Error("至少选择一道题");
  const current = listSavedPapers(input.bankId, storage);
  const paper: SavedPaper = {
    id: input.id ?? crypto.randomUUID(),
    bankId: input.bankId,
    name,
    questionOrder: [...input.questionOrder],
    orderMode: input.orderMode,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(key(input.bankId), JSON.stringify([
    paper,
    ...current.filter((item) => item.id !== paper.id),
  ]));
  return paper;
}

export function deleteSavedPaper(
  bankId: string,
  paperId: string,
  storage: PaperStorage = defaultStorage(),
): void {
  storage.setItem(key(bankId), JSON.stringify(
    listSavedPapers(bankId, storage).filter((paper) => paper.id !== paperId),
  ));
}
