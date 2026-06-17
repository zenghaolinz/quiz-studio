import type { AnswerSpec } from "./question";

export interface ScoreResult {
  correct: boolean;
  score: number;
  maxScore: number;
  reason?: string;
}

function normalizeText(value: string, caseSensitive: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

export function scoreObjectiveAnswer(
  answer: AnswerSpec,
  response: unknown,
  maxScore = 1,
): ScoreResult {
  if (answer.kind === "choice") {
    const submitted = Array.isArray(response)
      ? response.filter((value): value is string => typeof value === "string")
      : [];
    const expected = [...answer.optionIds].sort();
    const actual = [...new Set(submitted)].sort();
    const correct =
      expected.length === actual.length &&
      expected.every((value, index) => value === actual[index]);
    return {
      correct,
      score: correct ? maxScore : 0,
      maxScore,
      reason: correct ? undefined : "选项未与标准答案完全匹配",
    };
  }

  if (answer.kind === "boolean") {
    const correct = response === answer.value;
    return {
      correct,
      score: correct ? maxScore : 0,
      maxScore,
      reason: correct ? undefined : "判断结果错误",
    };
  }

  if (answer.kind === "blank") {
    const submitted = Array.isArray(response)
      ? response.map((value) => String(value))
      : [String(response ?? "")];

    if (submitted.length !== answer.acceptedAnswers.length) {
      return {
        correct: false,
        score: 0,
        maxScore,
        reason: "填空数量与标准答案不一致",
      };
    }

    const allCorrect = answer.acceptedAnswers.every((accepted, index) => {
      const actual = normalizeText(submitted[index] ?? "", answer.caseSensitive);
      return accepted.some(
        (candidate) => normalizeText(candidate, answer.caseSensitive) === actual,
      );
    });

    return {
      correct: allCorrect,
      score: allCorrect ? maxScore : 0,
      maxScore,
      reason: allCorrect ? undefined : "至少一个填空不匹配",
    };
  }

  throw new Error("主观题必须使用人工或 AI 评分流程");
}
