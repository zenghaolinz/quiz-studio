import type { Question } from "./question";
import { scoreObjectiveAnswer } from "./scoring";

export type TestResponses = Record<string, unknown>;
export type TestResultStatus = "correct" | "wrong" | "unanswered" | "pending" | "graded";

export interface TestQuestionResult {
  questionId: string;
  response: unknown;
  status: TestResultStatus;
  score: number | null;
  maxScore: number;
  answerRevealed: boolean;
}

export interface TestSessionSummary {
  results: TestQuestionResult[];
  objectiveScore: number;
  finalScore: number | null;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  pendingCount: number;
}

function hasResponse(response: unknown): boolean {
  if (response === undefined || response === null) return false;
  if (typeof response === "string") return response.trim().length > 0;
  if (Array.isArray(response)) return response.length > 0 && response.some(hasResponse);
  return true;
}

export function evaluateTestSession(
  questions: Question[],
  responses: TestResponses,
  revealed: Record<string, boolean> = {},
): TestSessionSummary {
  const results = questions.map<TestQuestionResult>((question) => {
    const response = responses[question.id];
    if (!hasResponse(response)) {
      return { questionId: question.id, response, status: "unanswered", score: 0, maxScore: question.maxScore, answerRevealed: Boolean(revealed[question.id]) };
    }
    if (question.answer.kind === "subjective") {
      return { questionId: question.id, response, status: "pending", score: null, maxScore: question.maxScore, answerRevealed: Boolean(revealed[question.id]) };
    }
    const scored = scoreObjectiveAnswer(question.answer, response, question.maxScore);
    return { questionId: question.id, response, status: scored.correct ? "correct" : "wrong", score: scored.score, maxScore: question.maxScore, answerRevealed: Boolean(revealed[question.id]) };
  });
  const pendingCount = results.filter((result) => result.status === "pending").length;
  const objectiveScore = results.reduce((sum, result) => sum + (result.score ?? 0), 0);
  return {
    results,
    objectiveScore,
    finalScore: pendingCount === 0 ? objectiveScore : null,
    maxScore: results.reduce((sum, result) => sum + result.maxScore, 0),
    correctCount: results.filter((result) => result.status === "correct").length,
    wrongCount: results.filter((result) => result.status === "wrong").length,
    unansweredCount: results.filter((result) => result.status === "unanswered").length,
    pendingCount,
  };
}
