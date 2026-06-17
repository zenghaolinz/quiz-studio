/**
 * 答案与解析解析。
 *
 * 规范化后答案标记形如：答案: B / 正确答案: ACD / 参考答案: 对 / 答案解析: ...
 * （： 已转 :，、／． 已转 .）。答案内容按题型解析为 DraftAnswer。
 */
import type { DraftAnswer } from "../types/question-draft";
import type { DraftOption } from "../types/question-draft";

const ANSWER_MARKER = /^(?:正确答案|参考答案|标准答案|答案)\s*:\s*(.*)$/;
const EXPLANATION_MARKER = /^(?:答案解析|试题解析|解析|分析|说明)\s*:\s*(.*)$/;

export function matchAnswerMarker(normalizedLine: string): string | null {
  const m = ANSWER_MARKER.exec(normalizedLine);
  return m ? (m[1] ?? "").trim() : null;
}

export function matchExplanationMarker(normalizedLine: string): string | null {
  const m = EXPLANATION_MARKER.exec(normalizedLine);
  return m ? (m[1] ?? "").trim() : null;
}

const TRUE_TOKENS = new Set(["对", "正确", "√", "t", "true", "是", "y", "yes", "✓"]);
const FALSE_TOKENS = new Set(["错", "错误", "×", "f", "false", "否", "n", "no", "✗"]);

/** 从答案文本中抽取出可作为选项字母的字符，并过滤为题中实际存在的选项。 */
export function parseChoiceLabels(answerText: string, options: DraftOption[]): string[] {
  const valid = new Set(options.map((o) => o.label));
  const letters = (answerText.match(/[A-Za-z]/g) ?? []).map((c) => c.toUpperCase());
  const labels: string[] = [];
  for (const l of letters) {
    if (valid.has(l) && !labels.includes(l)) labels.push(l);
  }
  return labels;
}

/** 判断答案文本是否表达布尔值。 */
export function parseBoolean(answerText: string): boolean | null {
  const t = answerText.trim().toLowerCase();
  if (TRUE_TOKENS.has(t)) return true;
  if (FALSE_TOKENS.has(t)) return false;
  return null;
}

/** 填空占位标记：3 个及以上下划线，或空括号 () （  ）。 */
const BLANK_PLACEHOLDER = /_{2,}|[(][\s　]*[)]/;

export function hasBlankPlaceholder(stem: string): boolean {
  return BLANK_PLACEHOLDER.test(stem);
}

/**
 * 根据答案文本与题目选项，给出 best-effort 的 DraftAnswer。
 * 注意：此函数不做题型判定，只把答案文本结构化；题型由 question-boundary.inferType 综合判定。
 */
export function parseAnswerContent(
  answerText: string | undefined,
  options: DraftOption[],
): DraftAnswer {
  const text = (answerText ?? "").trim();
  if (!text) return { kind: "unknown" };

  // 1) 有选项 → 优先按选择解析
  if (options.length > 0) {
    const labels = parseChoiceLabels(text, options);
    if (labels.length > 0) return { kind: "choice", optionLabels: labels };
  }

  // 2) 布尔
  const bool = parseBoolean(text);
  if (bool !== null) return { kind: "boolean", value: bool };

  // 3) 否则视为主观题参考答案
  return { kind: "subjective", referenceMarkdown: text };
}
