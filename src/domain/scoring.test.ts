import { describe, expect, it } from "vitest";
import { scoreObjectiveAnswer } from "./scoring";

describe("scoreObjectiveAnswer", () => {
  it("requires exact matching for multiple choice", () => {
    const result = scoreObjectiveAnswer(
      { kind: "choice", optionIds: ["a", "c"] },
      ["c", "a"],
      2,
    );
    expect(result).toEqual({ correct: true, score: 2, maxScore: 2 });
  });

  it("normalizes blank answers", () => {
    const result = scoreObjectiveAnswer(
      {
        kind: "blank",
        acceptedAnswers: [["Adenosine triphosphate", "ATP"]],
        caseSensitive: false,
      },
      [" atp "],
    );
    expect(result.correct).toBe(true);
  });
});
