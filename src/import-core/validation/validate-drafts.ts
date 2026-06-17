/**
 * 草稿校验：把"解析失败"细化到具体某道题的某类问题。
 *
 * 校验只产出告警，不修改草稿结构；阻断与否由调用方按 level 决定（error 必须修正才能导入）。
 * 每条告警同时写入 draft.warnings（题目级字符串）与返回的 ImportWarning[]（结构化，含 questionOrder）。
 */
import type { QuestionDraft } from "../types/question-draft";
import type { ImportWarning } from "../types/import-warning";

export interface ValidationResult {
  warnings: ImportWarning[];
  /** 是否存在 error 级告警（阻断导入） */
  hasErrors: boolean;
}

function optionLabelGap(options: { label: string }[]): string | null {
  if (options.length < 2) return null;
  const labels = options.map((o) => o.label.toUpperCase());
  // 期望 A,B,C,... 连续
  for (let i = 0; i < labels.length; i++) {
    const expected = String.fromCharCode("A".charCodeAt(0) + i);
    if (labels[i] !== expected) return expected; // 缺失的字母
  }
  return null;
}

export function validateDrafts(drafts: QuestionDraft[]): ValidationResult {
  const warnings: ImportWarning[] = [];
  const orderLabel = (order: number) => `第 ${order + 1} 题`;

  if (drafts.length === 0) {
    warnings.push({
      level: "error",
      code: "no_questions",
      message: "未识别到任何题目，请检查题号格式或换一份文件。",
    });
  }

  for (const draft of drafts) {
    const local: string[] = [];
    const push = (level: ImportWarning["level"], code: ImportWarning["code"], msg: string) => {
      local.push(msg);
      warnings.push({ level, code, questionOrder: draft.order, message: msg });
    };

    if (!draft.stemMarkdown.trim()) {
      push("error", "empty_stem", `${orderLabel(draft.order)}：题干为空。`);
    }

    if (draft.type === "unknown") {
      push("error", "ambiguous_type", `${orderLabel(draft.order)}：无法判定题型，请手动选择。`);
    }

    // 选项连续性
    const gap = optionLabelGap(draft.options);
    if (gap) {
      push("warning", "option_mismatch", `${orderLabel(draft.order)}：选项 ${gap} 缺失。`);
    }

    // 单选却出现多个答案 / 多选却只有一个答案
    if (draft.type === "single_choice" && draft.answer.kind === "choice" && draft.answer.optionLabels.length > 1) {
      push("error", "ambiguous_type",
        `${orderLabel(draft.order)}：识别为单选题，但检测到 ${draft.answer.optionLabels.length} 个正确答案（${draft.answer.optionLabels.join("")}）。`);
    }
    if (draft.type === "multiple_choice" && draft.answer.kind === "choice" && draft.answer.optionLabels.length === 1) {
      push("warning", "ambiguous_type",
        `${orderLabel(draft.order)}：识别为多选题，但只检测到 1 个正确答案，请确认。`);
    }

    // 答案缺失
    if (draft.answer.kind === "unknown") {
      push("warning", "missing_answer", `${orderLabel(draft.order)}：未检测到答案。`);
    }

    // 解析缺失（仅提示，不阻断）
    if (!draft.explanationMarkdown?.trim()) {
      push("warning", "missing_explanation", `${orderLabel(draft.order)}：未检测到解析。`);
    }

    draft.warnings = local;
  }

  const hasErrors = warnings.some((w) => w.level === "error");
  return { warnings, hasErrors };
}
