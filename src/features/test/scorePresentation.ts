import type { TestQuestionResult, TestSessionSummary } from "../../domain/session";

export function totalScoreView(summary: TestSessionSummary): {
  score: number;
  maxScore: number;
  pendingCount: number;
} {
  return {
    score: summary.finalScore ?? summary.results.reduce((total, result) => total + (result.score ?? 0), 0),
    maxScore: summary.maxScore,
    pendingCount: summary.pendingCount,
  };
}

export function questionScoreLabel(result: TestQuestionResult): string {
  return result.score === null
    ? `待评分 · 满分 ${result.maxScore} 分`
    : `${result.score} / ${result.maxScore} 分`;
}
