import { describe, expect, it } from "vitest";
import type { Question, QuestionBank } from "../../domain/question";
import {
  exportPortableBank,
  importPortableBank,
  searchQuestions,
} from "./portableBank";

const bank: QuestionBank = {
  id: "bank-1",
  name: " 化学基础 ",
  subject: "化学",
  description: "第一章",
  questionCount: 1,
  createdAt: "2026-06-18T00:00:00.000Z",
  updatedAt: "2026-06-18T00:00:00.000Z",
};

const question: Question = {
  id: "question-1",
  bankId: bank.id,
  parentId: null,
  type: "single_choice",
  stemMarkdown: "水的化学式是 $\\ce{H2O}$",
  options: [
    { id: "a", label: "A", contentMarkdown: "二氧化碳" },
    { id: "b", label: "B", contentMarkdown: "水" },
  ],
  answer: { kind: "choice", optionIds: ["b"] },
  explanationMarkdown: "由氢和氧组成",
  maxScore: 2,
  difficulty: 1,
  tags: ["物质", "入门"],
  sourceFileId: null,
  sourcePage: null,
  createdAt: "2026-06-18T00:00:00.000Z",
  updatedAt: "2026-06-18T00:00:00.000Z",
};

describe("portable question bank", () => {
  it("round-trips a versioned qbank without runtime ids", () => {
    const text = exportPortableBank(bank, [question]);
    const restored = importPortableBank(text);

    expect(restored.version).toBe(1);
    expect(restored.bank.name).toBe("化学基础");
    expect(restored.questions).toEqual([
      expect.objectContaining({
        type: "single_choice",
        stemMarkdown: question.stemMarkdown,
        answer: question.answer,
        maxScore: 2,
      }),
    ]);
    expect(restored.questions[0]).not.toHaveProperty("id");
    expect(restored.questions[0]).not.toHaveProperty("bankId");
  });

  it("rejects unsupported versions and malformed questions", () => {
    expect(() => importPortableBank('{"format":"quiz-studio-qbank","version":2}')).toThrow("不支持");
    expect(() => importPortableBank('{"format":"quiz-studio-qbank","version":1,"exportedAt":"2026-06-18T00:00:00.000Z","bank":{"name":"测试"},"questions":[]}')).toThrow("至少包含一道题");
  });
});

describe("question search", () => {
  it("matches stem, option, explanation and tags case-insensitively", () => {
    expect(searchQuestions([question], "H2O")).toHaveLength(1);
    expect(searchQuestions([question], "二氧化碳")).toHaveLength(1);
    expect(searchQuestions([question], "氢和氧")).toHaveLength(1);
    expect(searchQuestions([question], "入门")).toHaveLength(1);
    expect(searchQuestions([question], "不存在")).toHaveLength(0);
  });

  it("returns all questions for a blank query", () => {
    expect(searchQuestions([question], "  ")).toEqual([question]);
  });
});
