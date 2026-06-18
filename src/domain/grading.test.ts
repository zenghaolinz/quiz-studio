import { describe, expect, it } from "vitest";
import type { TestSessionSummary } from "./session";
import { applyGradingDraft, applySubjectiveGrades, validateGradingDraft } from "./grading";

const draft = {
  questionId: "subjective",
  suggestedScore: 3,
  maxScore: 5,
  feedbackMarkdown: "论点清楚。",
  criteria: [{ title: "论点", awardedPoints: 3, maxPoints: 5, feedback: "基本完整" }],
  providerId: "deepseek",
  model: "deepseek-chat",
  elapsedMs: 120,
};

describe("subjective grading", () => {
  it("rejects invalid and out-of-range scores", () => {
    expect(() => validateGradingDraft({ ...draft, suggestedScore: -1 })).toThrow("分数");
    expect(() => validateGradingDraft({ ...draft, suggestedScore: 6 })).toThrow("分数");
    expect(() => validateGradingDraft({ ...draft, suggestedScore: Number.NaN })).toThrow("分数");
  });

  it("applies the AI suggested score immediately", () => {
    const grade = applyGradingDraft(draft, "2026-06-18T00:00:00.000Z");
    expect(grade.score).toBe(3);
    expect(grade.gradedAt).toBe("2026-06-18T00:00:00.000Z");
  });

  it("replaces pending results and produces a final score after confirmation", () => {
    const summary: TestSessionSummary = {
      results: [
        { questionId: "objective", response: true, status: "correct", score: 1, maxScore: 1, answerRevealed: false },
        { questionId: "subjective", response: "answer", status: "pending", score: null, maxScore: 5, answerRevealed: false },
      ],
      objectiveScore: 1, finalScore: null, maxScore: 6,
      correctCount: 1, wrongCount: 0, unansweredCount: 0, pendingCount: 1,
    };
    const grade = applyGradingDraft(draft, "2026-06-18T00:00:00.000Z", 4);
    const graded = applySubjectiveGrades(summary, { subjective: grade });
    expect(graded.results[1].status).toBe("graded");
    expect(graded.pendingCount).toBe(0);
    expect(graded.finalScore).toBe(5);
  });

  it("replaces a previously confirmed score when the reviewer adjusts it", () => {
    const summary: TestSessionSummary = {
      results: [
        { questionId: "subjective", response: "answer", status: "graded", score: 4, maxScore: 5, answerRevealed: false },
      ],
      objectiveScore: 0, finalScore: 4, maxScore: 5,
      correctCount: 0, wrongCount: 0, unansweredCount: 0, pendingCount: 0,
    };
    const adjusted = applyGradingDraft(draft, "2026-06-18T01:00:00.000Z", 3);
    expect(applySubjectiveGrades(summary, { subjective: adjusted }).finalScore).toBe(3);
  });
});
