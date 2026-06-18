import { describe, expect, it } from "vitest";
import type { TestSessionSummary } from "../../domain/session";
import { questionScoreLabel, totalScoreView } from "./scorePresentation";

const summary: TestSessionSummary = {
  results: [
    { questionId: "q1", response: true, status: "correct", score: 2, maxScore: 2, answerRevealed: false },
    { questionId: "q2", response: "回答", status: "pending", score: null, maxScore: 8, answerRevealed: false },
  ],
  objectiveScore: 2,
  finalScore: null,
  maxScore: 10,
  correctCount: 1,
  wrongCount: 0,
  unansweredCount: 0,
  pendingCount: 1,
};

describe("test score presentation", () => {
  it("always exposes the current total and full paper score", () => {
    expect(totalScoreView(summary)).toEqual({ score: 2, maxScore: 10, pendingCount: 1 });
    expect(totalScoreView({ ...summary, results: [{ ...summary.results[1], status: "graded", score: 6 }], finalScore: 6, pendingCount: 0 }))
      .toEqual({ score: 6, maxScore: 10, pendingCount: 0 });
  });

  it("formats each question score or its pending state", () => {
    expect(questionScoreLabel(summary.results[0])).toBe("2 / 2 分");
    expect(questionScoreLabel(summary.results[1])).toBe("待评分 · 满分 8 分");
  });
});
