import { describe, expect, it } from "vitest";
import type { Question, QuestionType } from "./question";
import {
  buildQuestionOrder,
  filterQuestionIndexes,
  restoreQuestionOrder,
} from "./questionNavigation";

function question(id: string, type: QuestionType): Question {
  return {
    id,
    bankId: "bank",
    type,
    stemMarkdown: id,
    options: [],
    answer: type === "true_false"
      ? { kind: "boolean", value: true }
      : { kind: "subjective", referenceAnswerMarkdown: "answer", rubric: [] },
    maxScore: 1,
    tags: [],
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

const questions = [
  question("q1", "true_false"),
  question("q2", "fill_blank"),
  question("q3", "true_false"),
  question("q4", "essay"),
];

describe("question navigation", () => {
  it("builds the original question order", () => {
    expect(buildQuestionOrder(questions, "sequential")).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("builds a shuffled order without dropping or duplicating questions", () => {
    const order = buildQuestionOrder(questions, "random", () => 0);
    expect(order).toEqual(["q2", "q3", "q4", "q1"]);
    expect(new Set(order)).toEqual(new Set(["q1", "q2", "q3", "q4"]));
  });

  it("restores saved order while dropping deleted and appending new questions", () => {
    expect(restoreQuestionOrder(questions, ["q3", "deleted", "q1"])).toEqual([
      "q3", "q1", "q2", "q4",
    ]);
  });

  it("returns session indexes matching the selected question type", () => {
    const order = ["q4", "q1", "q3", "q2"];
    expect(filterQuestionIndexes(questions, order, "true_false")).toEqual([1, 2]);
    expect(filterQuestionIndexes(questions, order, "all")).toEqual([0, 1, 2, 3]);
  });
});
