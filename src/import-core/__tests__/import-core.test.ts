import { describe, expect, it } from "vitest";
import {
  parseImport,
  parseTxt,
  convertDraftToQuestionInput,
  validateDrafts,
  groupBlocksIntoDrafts,
  classifyLine,
} from "../index";
import type { QuestionDraft } from "../types/question-draft";

/** 取第 n 题（0 基） */
function q(drafts: QuestionDraft[], n: number): QuestionDraft {
  const found = drafts[n];
  if (!found) throw new Error(`missing draft #${n}`);
  return found;
}

const T1 = `1. 方程 $x^2=1$ 的负实数解是
A. $x=1$
B. $x=-1$
答案: B
解析: $x^2=1$ 的两解为 $x=\\pm1$`;

const T2 = `1、下列哪些属于酸
A、HCl
B、NaOH
C、H2SO4
正确答案：AC`;

const T3 = `第1题 地球绕太阳公转。
A. 对
B. 错
答案: A`;

const T4 = `1. 水在标准大气压下100℃沸腾。
答案: 对`;

const T5 = `1. ____ 是细胞的能量货币。
答案: ATP`;

const T6 = `1. 简述 PCR 中引物的作用。
参考答案: 引物为 DNA 聚合酶提供 3'-OH 起始点并限定扩增边界。`;

const T7 = `（1）下列哪个是碱
（A）NaOH
（B）HCl
（C）NaCl
答案: A`;

const T8 = `1. 题干如下
A. 这是一个很长的选项它
延续到了第二行
B. 选项二
答案: A`;

const T9 = `1．全角点号题号
A．全角选项一
B．全角选项二
答案：B`;

const T10 = `1. 题
A. x
B. y
D. z
答案: A`;

describe("parseTxt — 题型与排版符号", () => {
  it("单选：1. + A. + 答案/解析，保留 LaTeX", () => {
    const d = parseTxt(T1);
    expect(d.questions).toHaveLength(1);
    const a = q(d.questions, 0);
    expect(a.type).toBe("single_choice");
    expect(a.stemMarkdown).toContain("$x^2=1$");
    expect(a.options).toHaveLength(2);
    expect(a.options[0].label).toBe("A");
    expect(a.options[0].contentMarkdown).toBe("$x=1$");
    expect(a.answer).toEqual({ kind: "choice", optionLabels: ["B"] });
    expect(a.explanationMarkdown).toContain("$x=\\pm1$");
    expect(a.sourceRange).toEqual({ startBlock: 0, endBlock: 4 });
  });

  it("多选：1、 + A、 + 正确答案：AC", () => {
    const a = q(parseTxt(T2).questions, 0);
    expect(a.type).toBe("multiple_choice");
    expect(a.options).toHaveLength(3);
    expect(a.answer).toEqual({ kind: "choice", optionLabels: ["A", "C"] });
  });

  it("判断（带选项）：第1题 + A.对 B.错 + 答案:A", () => {
    const a = q(parseTxt(T3).questions, 0);
    expect(a.type).toBe("true_false");
    expect(a.answer).toEqual({ kind: "boolean", value: true });
  });

  it("判断（无选项）：答案:对", () => {
    const a = q(parseTxt(T4).questions, 0);
    expect(a.type).toBe("true_false");
    expect(a.answer).toEqual({ kind: "boolean", value: true });
  });

  it("填空：____ 占位 + 单空答案", () => {
    const a = q(parseTxt(T5).questions, 0);
    expect(a.type).toBe("fill_blank");
    expect(a.answer).toEqual({ kind: "blank", acceptedAnswers: [["ATP"]] });
  });

  it("简答：参考答案 → subjective", () => {
    const a = q(parseTxt(T6).questions, 0);
    expect(a.type).toBe("short_answer");
    expect(a.answer.kind).toBe("subjective");
  });

  it("（1）+ （A）全角括号", () => {
    const a = q(parseTxt(T7).questions, 0);
    expect(a.type).toBe("single_choice");
    expect(a.options.map((o) => o.label)).toEqual(["A", "B", "C"]);
    expect(a.answer).toEqual({ kind: "choice", optionLabels: ["A"] });
  });

  it("选项续行：文本块并入上一个选项", () => {
    const a = q(parseTxt(T8).questions, 0);
    expect(a.options[0].contentMarkdown).toBe("这是一个很长的选项它 延续到了第二行");
    expect(a.options[1].contentMarkdown).toBe("选项二");
  });

  it("全角点号 1． A． 答案：", () => {
    const a = q(parseTxt(T9).questions, 0);
    expect(a.type).toBe("single_choice");
    expect(a.options).toHaveLength(2);
    expect(a.answer).toEqual({ kind: "choice", optionLabels: ["B"] });
  });

  it("选项缺 C：校验告警 option_mismatch", () => {
    const d = parseTxt(T10);
    const a = q(d.questions, 0);
    expect(a.options.map((o) => o.label)).toEqual(["A", "B", "D"]);
    const { warnings } = validateDrafts(d.questions);
    expect(warnings.some((w) => w.code === "option_mismatch" && w.message.includes("C"))).toBe(true);
  });
});

describe("多题切分与边界", () => {
  it("连续多题，各自独立且 sourceRange 连续", () => {
    const text = `${T1}\n${T2}`;
    const d = parseTxt(text);
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0].sourceRange!.startBlock).toBe(0);
    expect(d.questions[1].sourceRange!.startBlock).toBeGreaterThan(d.questions[0].sourceRange!.endBlock);
  });

  it("无题号 → no_questions error", () => {
    const d = parseTxt("只是一段没有题号的普通文字。");
    const { warnings, hasErrors } = validateDrafts(d.questions);
    expect(d.questions).toHaveLength(0);
    expect(hasErrors).toBe(true);
    expect(warnings.some((w) => w.code === "no_questions")).toBe(true);
  });

  it("草稿 id 与 order 稳定（q-0, q-1…）", () => {
    const d = parseTxt(`${T1}\n${T4}`);
    expect(d.questions.map((x) => x.id)).toEqual(["q-0", "q-1"]);
    expect(d.questions.map((x) => x.order)).toEqual([0, 1]);
  });
});

describe("校验：精确到题的告警", () => {
  it("单选却两个答案 → error", () => {
    // 构造一个被手动改为 single_choice 但答案含 2 个标签的草稿
    const draft: QuestionDraft = {
      id: "q-0", order: 0, type: "single_choice",
      stemMarkdown: "题", options: [{ id: "a", label: "A", contentMarkdown: "x" }, { id: "b", label: "B", contentMarkdown: "y" }],
      answer: { kind: "choice", optionLabels: ["A", "B"] }, confidence: 1, warnings: [],
    };
    const { warnings, hasErrors } = validateDrafts([draft]);
    expect(hasErrors).toBe(true);
    expect(warnings.some((w) => w.code === "ambiguous_type" && w.message.includes("个正确答案"))).toBe(true);
  });

  it("缺答案 → warning missing_answer", () => {
    const draft: QuestionDraft = {
      id: "q-0", order: 0, type: "single_choice",
      stemMarkdown: "题", options: [{ id: "a", label: "A", contentMarkdown: "x" }],
      answer: { kind: "unknown" }, confidence: 1, warnings: [],
    };
    const { warnings } = validateDrafts([draft]);
    expect(warnings.some((w) => w.code === "missing_answer")).toBe(true);
  });
});

describe("convertDraftToQuestionInput", () => {
  it("choice 草稿 → optionIds 映射", () => {
    const a = q(parseTxt(T1).questions, 0);
    const input = convertDraftToQuestionInput(a, "bank-1");
    expect(input.bankId).toBe("bank-1");
    expect(input.type).toBe("single_choice");
    expect(input.options[0]).toEqual({ id: "a", label: "A", contentMarkdown: "$x=1$" });
    expect(input.answer).toEqual({ kind: "choice", optionIds: ["b"] });
    expect(input.explanationMarkdown).toContain("$x=\\pm1$");
  });

  it("unknown 题型 → 抛错", () => {
    const draft: QuestionDraft = {
      id: "q-0", order: 0, type: "unknown", stemMarkdown: "x",
      options: [], answer: { kind: "unknown" }, confidence: 1, warnings: [],
    };
    expect(() => convertDraftToQuestionInput(draft, "b")).toThrow(/题型未知/);
  });
});

describe("Markdown 解析", () => {
  it("剥离标题/强调/列表标记，保留 LaTeX 与题号", () => {
    const md = `# 数学题库

1. **题干**：$x^2=1$ 的负解是
- A. $x=1$
- B. $x=-1$

答案: B
解析: 两解为 $\\pm1$`;
    const d = parseImport("markdown", md, { sourceFileId: "f1", sourceName: "t.md" });
    const a = q(d.questions, 0);
    expect(a.type).toBe("single_choice");
    expect(a.stemMarkdown).toBe("题干:$x^2=1$ 的负解是");
    expect(a.options).toHaveLength(2);
    expect(a.answer).toEqual({ kind: "choice", optionLabels: ["B"] });
    expect(d.sourceType).toBe("markdown");
    expect(d.status).toBe("needs_review");
  });
});

describe("classifyLine 单元", () => {
  it("题号 / 选项 / 答案 / 解析 / 正文 分类", () => {
    expect(classifyLine("1. 题", 0, 1, "1. 题").kind).toBe("question_start");
    expect(classifyLine("A. 选项", 1, 2, "A. 选项").kind).toBe("option");
    expect(classifyLine("答案: B", 2, 3, "答案: B").kind).toBe("answer");
    expect(classifyLine("解析: x", 3, 4, "解析: x").kind).toBe("explanation");
    expect(classifyLine("普通文字", 4, 5, "普通文字").kind).toBe("text");
  });
});
