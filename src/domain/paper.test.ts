import { describe, expect, it } from "vitest";
import type { Question, QuestionType } from "./question";
import { composePaper, moveQuestion, reconcilePaperOrder } from "./paper";

function makeQuestion(id: string, type: QuestionType): Question {
  return {
    id, bankId: "bank", type, stemMarkdown: id, options: [],
    answer: type === "true_false"
      ? { kind: "boolean", value: true }
      : { kind: "subjective", referenceAnswerMarkdown: "answer", rubric: [] },
    maxScore: 1, tags: [], createdAt: "2026-06-18T00:00:00.000Z", updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

const questions = [
  makeQuestion("q1", "single_choice"),
  makeQuestion("q2", "fill_blank"),
  makeQuestion("q3", "fill_blank"),
  makeQuestion("q4", "true_false"),
  makeQuestion("q5", "fill_blank"),
  makeQuestion("q6", "essay"),
];

describe("paper composition", () => {
  it("applies inclusive question range and per-type quotas", () => {
    expect(composePaper(questions, {
      rangeStart: 2,
      rangeEnd: 5,
      quotas: { fill_blank: 2, true_false: 1 },
    })).toEqual(["q2", "q3", "q4"]);
  });

  it("caps a quota at the available question count", () => {
    expect(composePaper(questions, {
      rangeStart: 1,
      rangeEnd: 3,
      quotas: { fill_blank: 10 },
    })).toEqual(["q2", "q3"]);
  });

  it("moves an exact selected question without losing selection", () => {
    expect(moveQuestion(["q1", "q2", "q3"], "q3", -1)).toEqual(["q1", "q3", "q2"]);
    expect(moveQuestion(["q1", "q2", "q3"], "q1", -1)).toEqual(["q1", "q2", "q3"]);
  });

  it("drops deleted questions without adding new questions to an existing paper", () => {
    expect(reconcilePaperOrder(questions, ["q3", "deleted", "q1"])).toEqual(["q3", "q1"]);
  });
});
