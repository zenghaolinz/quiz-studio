import { invokeCommand, isTauriRuntime } from "../../lib/tauri";
import type { QuestionOrderMode } from "../../domain/questionNavigation";
import type { SubjectiveGrade } from "../../domain/grading";

export interface TestSessionSettings {
  currentIndex?: number;
  questionOrder?: string[];
  orderMode?: QuestionOrderMode;
}

export interface SavedAttempt {
  id?: string;
  questionId: string;
  response: unknown;
  answerRevealed: boolean;
  isCorrect?: boolean | null;
  score?: number | null;
  aiGrading?: SubjectiveGrade | null;
}

export interface TestSessionSnapshot {
  id: string;
  bankId: string;
  status: "in_progress" | "submitted";
  settings: TestSessionSettings;
  score?: number | null;
  maxScore?: number | null;
  startedAt: string;
  submittedAt?: string | null;
  attempts: SavedAttempt[];
}

export interface SaveTestSessionInput {
  id?: string;
  bankId: string;
  status: "in_progress" | "submitted";
  settings: TestSessionSettings & { currentIndex: number };
  score?: number | null;
  maxScore?: number | null;
  attempts: SavedAttempt[];
}

const KEY = "quiz-studio.test-sessions.v1";

function readBrowserSessions(): TestSessionSnapshot[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TestSessionSnapshot[]; }
  catch { return []; }
}

export async function saveTestSession(input: SaveTestSessionInput): Promise<TestSessionSnapshot> {
  if (isTauriRuntime()) return invokeCommand<TestSessionSnapshot>("save_test_session", { input });
  const sessions = readBrowserSessions();
  const existing = input.id ? sessions.find((session) => session.id === input.id) : undefined;
  const snapshot: TestSessionSnapshot = {
    ...input,
    id: existing?.id ?? crypto.randomUUID(),
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    submittedAt: input.status === "submitted" ? new Date().toISOString() : null,
  };
  localStorage.setItem(KEY, JSON.stringify([snapshot, ...sessions.filter((session) => session.id !== snapshot.id)]));
  return snapshot;
}

export async function getActiveTestSession(bankId: string): Promise<TestSessionSnapshot | null> {
  if (isTauriRuntime()) return invokeCommand<TestSessionSnapshot | null>("get_active_test_session", { bankId });
  return readBrowserSessions().find((session) => session.bankId === bankId && session.status === "in_progress") ?? null;
}
