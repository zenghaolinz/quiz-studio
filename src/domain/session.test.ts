import { describe, expect, it } from "vitest";
import type { Question } from "./question";
import { evaluateTestSession } from "./session";

function question(overrides: Partial<Question>): Question {
  return {
    id: "q1", bankId: "b1", type: "true_false", stemMarkdown: "题目", options: [],
    answer: { kind: "boolean", value: true }, maxScore: 2, tags: [], createdAt: "now", updatedAt: "now",
    ...overrides,
  };
}

describe("evaluateTestSession", () => {
  it("scores objective answers and keeps unanswered separate", () => {
    const questions = [
      question({ id: "correct" }),
      question({ id: "wrong", answer: { kind: "boolean", value: false } }),
      question({ id: "blank" }),
    ];
    const result = evaluateTestSession(questions, { correct: true, wrong: true });

    expect(result.objectiveScore).toBe(2);
    expect(result.maxScore).toBe(6);
    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
    expect(result.results.find((item) => item.questionId === "blank")?.status).toBe("unanswered");
  });

  it("marks subjective responses as pending without inventing a final score", () => {
    const questions = [question({
      id: "essay",
      type: "essay",
      maxScore: 10,
      answer: { kind: "subjective", referenceAnswerMarkdown: "参考", rubric: [] },
    })];
    const result = evaluateTestSession(questions, { essay: "我的回答" }, { essay: true });

    expect(result.pendingCount).toBe(1);
    expect(result.finalScore).toBeNull();
    expect(result.results[0]).toMatchObject({ status: "pending", answerRevealed: true });
  });

  it("returns a final score when no subjective grading is pending", () => {
    const result = evaluateTestSession([question({ id: "q" })], { q: true });
    expect(result.finalScore).toBe(2);
  });
});
