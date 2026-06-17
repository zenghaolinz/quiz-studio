/**
 * 切题器核心：题号识别 + block 分组 + 题型推断。
 *
 * 流程：解析器先把文本切成带类型的 DocumentBlock[]，本模块把它们聚合成 QuestionDraft[]。
 * 一道题 = 一个题号行起始，到下一个题号行之前结束。选项 / 答案 / 解析 / 续行各自归位。
 */
import type { DocumentBlock } from "../types/document-block";
import type {
  DraftAnswer,
  DraftOption,
  QuestionDraft,
  QuestionDraftType,
} from "../types/question-draft";
import {
  hasBlankPlaceholder,
  matchAnswerMarker,
  matchExplanationMarker,
  parseBoolean,
  parseChoiceLabels,
} from "./answer-parser";
import { labelToId, matchOption } from "./option-parser";

/**
 * 题号行识别（规范化后）。
 * 兼容：1.  1、(已转.)  1．(已转.)  (1) （1）(已转)  第1题  第 1 题
 * 用 `(?=\D|$)` 避免 "1.5" 这类小数被误判为题号。
 */
const QUESTION_START = /^(?:(\d+)[.](?=\D|$)|(?:[(](\d+)[)])|第\s*(\d+)\s*题)\s*(.*)$/;

export function matchQuestionStart(normalizedLine: string): { number: string; rest: string } | null {
  const m = QUESTION_START.exec(normalizedLine);
  if (!m) return null;
  const number = m[1] ?? m[2] ?? m[3] ?? "";
  if (!number) return null;
  return { number, rest: (m[4] ?? "").trim() };
}

/** 把一行分类为 DocumentBlock（题号/选项/答案/解析/正文）。 */
export function classifyLine(
  normalized: string,
  index: number,
  lineNumber: number,
  raw: string,
): DocumentBlock {
  const q = matchQuestionStart(normalized);
  if (q) {
    return { index, kind: "question_start", rawText: raw, text: q.rest, lineNumber, marker: q.number };
  }
  const opt = matchOption(normalized);
  if (opt) {
    return { index, kind: "option", rawText: raw, text: opt.content, lineNumber, marker: opt.label };
  }
  const ans = matchAnswerMarker(normalized);
  if (ans !== null) {
    return { index, kind: "answer", rawText: raw, text: ans, lineNumber };
  }
  const expl = matchExplanationMarker(normalized);
  if (expl !== null) {
    return { index, kind: "explanation", rawText: raw, text: expl, lineNumber };
  }
  return { index, kind: "text", rawText: raw, text: normalized, lineNumber };
}

type Target = "stem" | "option" | "answer" | "explanation";

interface DraftBuilder {
  order: number;
  stem: string;
  options: DraftOption[];
  answerText: string;
  explanationText: string;
  startBlock: number;
  endBlock: number;
  lastTarget: Target;
}

const TRUE_TOKENS = new Set(["对", "正确", "√", "t", "true", "是", "✓"]);
const FALSE_TOKENS = new Set(["错", "错误", "×", "f", "false", "否", "✗"]);

function isBooleanOption(content: string): boolean {
  const t = content.trim().toLowerCase();
  return TRUE_TOKENS.has(t) || FALSE_TOKENS.has(t);
}

function booleanOptionValue(content: string): boolean | null {
  const t = content.trim().toLowerCase();
  if (TRUE_TOKENS.has(t)) return true;
  if (FALSE_TOKENS.has(t)) return false;
  return null;
}

/** 综合题干、选项、答案文本推断题型。 */
export function inferType(
  stem: string,
  options: DraftOption[],
  answerText: string,
): QuestionDraftType {
  const booleanOptions = options.length === 2 && options.every((o) => isBooleanOption(o.contentMarkdown));

  if (options.length >= 2) {
    const labels = parseChoiceLabels(answerText, options);
    if (labels.length >= 2) return "multiple_choice";
    if (labels.length === 1) {
      return booleanOptions ? "true_false" : "single_choice";
    }
    // 答案不是字母：可能是布尔文本或缺失
    if (parseBoolean(answerText) !== null) {
      return booleanOptions ? "true_false" : "single_choice";
    }
    return "single_choice"; // 有选项但答案未识别，默认单选，交校验告警
  }

  // 无选项
  if (parseBoolean(answerText) !== null) return "true_false";
  if (hasBlankPlaceholder(stem)) return "fill_blank";
  if (answerText.trim()) return "short_answer";
  return "unknown";
}

/** 按题型把答案文本结构化为 DraftAnswer。 */
function buildAnswer(
  type: QuestionDraftType,
  answerText: string,
  options: DraftOption[],
): DraftAnswer {
  const text = answerText.trim();
  switch (type) {
    case "single_choice":
    case "multiple_choice": {
      const labels = parseChoiceLabels(text, options);
      return labels.length > 0 ? { kind: "choice", optionLabels: labels } : { kind: "unknown" };
    }
    case "true_false": {
      const direct = parseBoolean(text);
      if (direct !== null) return { kind: "boolean", value: direct };
      // 答案是选项字母时，取该选项内容的布尔值
      const labels = parseChoiceLabels(text, options);
      if (labels.length === 1) {
        const opt = options.find((o) => o.label === labels[0]);
        const v = opt ? booleanOptionValue(opt.contentMarkdown) : null;
        if (v !== null) return { kind: "boolean", value: v };
      }
      return { kind: "unknown" };
    }
    case "fill_blank": {
      // 多空按分号分隔；单空整段为一个可接受答案
      const parts = text.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return { kind: "unknown" };
      return { kind: "blank", acceptedAnswers: parts.map((p) => [p]) };
    }
    case "short_answer":
    case "essay":
      return text ? { kind: "subjective", referenceMarkdown: text } : { kind: "unknown" };
    case "unknown":
    default:
      return { kind: "unknown" };
  }
}

/** 把 DocumentBlock[] 聚合成 QuestionDraft[]。 */
export function groupBlocksIntoDrafts(blocks: DocumentBlock[]): QuestionDraft[] {
  const drafts: QuestionDraft[] = [];
  let cur: DraftBuilder | null = null;

  const finalize = (b: DraftBuilder) => {
    const type = inferType(b.stem, b.options, b.answerText);
    const answer = buildAnswer(type, b.answerText, b.options);
    drafts.push({
      id: `q-${b.order}`,
      order: b.order,
      type,
      stemMarkdown: b.stem.trim(),
      options: b.options,
      answer,
      explanationMarkdown: b.explanationText.trim() || undefined,
      sourceRange: { startBlock: b.startBlock, endBlock: b.endBlock },
      confidence: 1,
      warnings: [],
    });
  };

  for (const block of blocks) {
    switch (block.kind) {
      case "question_start": {
        if (cur) finalize(cur);
        cur = {
          order: drafts.length,
          stem: block.text,
          options: [],
          answerText: "",
          explanationText: "",
          startBlock: block.index,
          endBlock: block.index,
          lastTarget: "stem",
        };
        break;
      }
      case "option": {
        if (!cur) break; // 题号前的选项忽略
        cur.options.push({
          id: labelToId(block.marker ?? ""),
          label: block.marker ?? "",
          contentMarkdown: block.text,
        });
        cur.lastTarget = "option";
        cur.endBlock = block.index;
        break;
      }
      case "answer": {
        if (!cur) break;
        cur.answerText = cur.answerText ? `${cur.answerText} ${block.text}` : block.text;
        cur.lastTarget = "answer";
        cur.endBlock = block.index;
        break;
      }
      case "explanation": {
        if (!cur) break;
        cur.explanationText = cur.explanationText
          ? `${cur.explanationText} ${block.text}`
          : block.text;
        cur.lastTarget = "explanation";
        cur.endBlock = block.index;
        break;
      }
      case "text":
      default: {
        if (!cur) break; // 文档 preamble，忽略
        appendContinuation(cur, block.text);
        cur.endBlock = block.index;
        break;
      }
    }
  }
  if (cur) finalize(cur);
  return drafts;
}

function appendContinuation(b: DraftBuilder, text: string): void {
  switch (b.lastTarget) {
    case "option": {
      const last = b.options[b.options.length - 1];
      if (last) last.contentMarkdown = `${last.contentMarkdown} ${text}`.trim();
      else b.stem = `${b.stem} ${text}`;
      break;
    }
    case "answer":
      b.answerText = `${b.answerText} ${text}`.trim();
      break;
    case "explanation":
      b.explanationText = `${b.explanationText} ${text}`.trim();
      break;
    case "stem":
    default:
      b.stem = `${b.stem} ${text}`.trim();
      break;
  }
}
