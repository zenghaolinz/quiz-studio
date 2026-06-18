import type { TestSessionSummary } from "./session";

export interface GradingCriterionResult {
  rubricId?: string;
  title: string;
  awardedPoints: number;
  maxPoints: number;
  feedback: string;
}

export interface AiGradingDraft {
  questionId: string;
  suggestedScore: number;
  maxScore: number;
  feedbackMarkdown: string;
  criteria: GradingCriterionResult[];
  providerId: string;
  model: string;
  elapsedMs: number;
}

export interface SubjectiveGrade extends AiGradingDraft {
  score: number;
  gradedAt: string;
}

function assertScore(score: number, maxScore: number): void {
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    throw new Error(`评分分数必须在 0 到 ${maxScore} 之间`);
  }
}

export function validateGradingDraft(draft: AiGradingDraft): AiGradingDraft {
  if (!Number.isFinite(draft.maxScore) || draft.maxScore <= 0) throw new Error("题目满分必须大于 0");
  assertScore(draft.suggestedScore, draft.maxScore);
  for (const criterion of draft.criteria) {
    if (!Number.isFinite(criterion.maxPoints) || criterion.maxPoints < 0) throw new Error("评分点满分无效");
    assertScore(criterion.awardedPoints, criterion.maxPoints);
  }
  return draft;
}

export function applyGradingDraft(
  draft: AiGradingDraft,
  gradedAt = new Date().toISOString(),
  score = draft.suggestedScore,
): SubjectiveGrade {
  validateGradingDraft(draft);
  assertScore(score, draft.maxScore);
  return { ...draft, score, gradedAt };
}

export function applySubjectiveGrades(
  summary: TestSessionSummary,
  grades: Record<string, SubjectiveGrade>,
): TestSessionSummary {
  const results = summary.results.map((result) => {
    const grade = grades[result.questionId];
    return grade && (result.status === "pending" || result.status === "graded")
      ? { ...result, status: "graded" as const, score: grade.score }
      : result;
  });
  const pendingCount = results.filter((result) => result.status === "pending").length;
  const finalScore = pendingCount === 0
    ? results.reduce((total, result) => total + (result.score ?? 0), 0)
    : null;
  return { ...summary, results, pendingCount, finalScore };
}
