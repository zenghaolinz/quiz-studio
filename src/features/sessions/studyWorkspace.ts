import type { QuestionOrderMode } from "../../domain/questionNavigation";
import type { TestSessionSummary } from "../../domain/session";
import type { SubjectiveGrade } from "../../domain/grading";

export type StudyMode = "practice" | "test";

export interface StudyWorkspace {
  version: 1;
  bankId: string;
  mode: StudyMode;
  questionOrder: string[];
  orderMode: QuestionOrderMode;
  currentIndex: number;
  responses: Record<string, unknown>;
  submitted: Record<string, unknown>;
  revealed: Record<string, boolean>;
  summary?: TestSessionSummary | null;
  grades?: Record<string, SubjectiveGrade>;
}

function workspaceKey(mode: StudyMode, bankId: string): string {
  return `quiz-studio.workspace.${mode}.${bankId}.v1`;
}

export function loadStudyWorkspace(
  mode: StudyMode,
  bankId: string,
  storage: Storage = window.localStorage,
): StudyWorkspace | null {
  try {
    const raw = storage.getItem(workspaceKey(mode, bankId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudyWorkspace>;
    if (
      parsed.version !== 1 || parsed.mode !== mode || parsed.bankId !== bankId ||
      !Array.isArray(parsed.questionOrder) || typeof parsed.currentIndex !== "number" ||
      !parsed.responses || !parsed.submitted || !parsed.revealed
    ) return null;
    return parsed as StudyWorkspace;
  } catch {
    return null;
  }
}

export function saveStudyWorkspace(
  workspace: StudyWorkspace,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(workspaceKey(workspace.mode, workspace.bankId), JSON.stringify(workspace));
  } catch {
    // 存储配额或隐私模式异常不应中断当前答题。
  }
}

export function removeStudyWorkspace(
  mode: StudyMode,
  bankId: string,
  storage: Storage = window.localStorage,
): void {
  storage.removeItem(workspaceKey(mode, bankId));
}
