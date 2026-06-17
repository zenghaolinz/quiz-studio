/**
 * 草稿校验：把解析问题细化到具体题目。
 * error 必须修正才能导入；warning 仅提示核对。
 */
import type { DraftAnswer, QuestionDraft, QuestionDraftType } from "../types/question-draft";
import type { ImportWarning } from "../types/import-warning";

export interface ValidationResult {
  warnings: ImportWarning[];
  hasErrors: boolean;
}

function optionLabelGap(options: { label: string }[]): string | null {
  if (options.length < 2) return null;
  const labels = options.map((o) => o.label.toUpperCase());
  for (let i = 0; i < labels.length; i += 1) {
    const expected = String.fromCharCode("A".charCodeAt(0) + i);
    if (labels[i] !== expected) return expected;
  }
  return null;
}

function expectedAnswerKind(type: QuestionDraftType): DraftAnswer["kind"] | null {
  switch (type) {
    case "single_choice":
    case "multiple_choice":
      return "choice";
    case "true_false":
      return "boolean";
    case "fill_blank":
      return "blank";
    case "short_answer":
    case "essay":
      return "subjective";
    case "unknown":
    default:
      return null;
  }
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

    const isChoice = draft.type === "single_choice" || draft.type === "multiple_choice";
    if (isChoice && draft.options.length < 2) {
      push("error", "option_mismatch", `${orderLabel(draft.order)}：选择题至少需要两个选项。`);
    }

    const gap = optionLabelGap(draft.options);
    if (gap) {
      push("warning", "option_mismatch", `${orderLabel(draft.order)}：选项 ${gap} 缺失。`);
    }

    if (draft.answer.kind === "unknown") {
      // 正式题目转换不接受 unknown，必须在预览页补全，因此这里应阻断而不是仅警告。
      push("error", "missing_answer", `${orderLabel(draft.order)}：未检测到答案，请补充后再导入。`);
    } else {
      const expected = expectedAnswerKind(draft.type);
      if (expected && draft.answer.kind !== expected) {
        push(
          "error",
          "answer_type_mismatch",
          `${orderLabel(draft.order)}：当前题型需要 ${expected} 类型答案，但实际为 ${draft.answer.kind}。请重新填写答案。`,
        );
      }
    }

    if (draft.answer.kind === "choice") {
      const available = new Set(draft.options.map((option) => option.label));
      const missing = draft.answer.optionLabels.filter((label) => !available.has(label));
      if (missing.length > 0) {
        push(
          "error",
          "answer_option_missing",
          `${orderLabel(draft.order)}：答案引用了不存在的选项 ${missing.join("、")}。`,
        );
      }
    }

    if (draft.type === "single_choice" && draft.answer.kind === "choice" && draft.answer.optionLabels.length > 1) {
      push(
        "error",
        "ambiguous_type",
        `${orderLabel(draft.order)}：识别为单选题，但检测到 ${draft.answer.optionLabels.length} 个正确答案（${draft.answer.optionLabels.join("")}）。`,
      );
    }
    if (draft.type === "multiple_choice" && draft.answer.kind === "choice" && draft.answer.optionLabels.length === 1) {
      push(
        "warning",
        "ambiguous_type",
        `${orderLabel(draft.order)}：识别为多选题，但只检测到 1 个正确答案，请确认。`,
      );
    }

    if (!draft.explanationMarkdown?.trim()) {
      push("warning", "missing_explanation", `${orderLabel(draft.order)}：未检测到解析。`);
    }

    // 当前组件直接展示 draft.warnings。这里覆盖旧结果，确保用户修正后警告立即消失。
    draft.warnings = local;
  }

  return {
    warnings,
    hasErrors: warnings.some((warning) => warning.level === "error"),
  };
}
