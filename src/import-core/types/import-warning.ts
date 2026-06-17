/**
 * 导入告警。
 *
 * 错误不只是一句"解析失败"，而是精确到某道题 / 某个 block，让用户在预览编辑器里逐条处理。
 * level 区分：error 必须修正才能导入，warning 建议核对但不阻断。
 */
export type ImportWarningLevel = "error" | "warning";

export interface ImportWarning {
  level: ImportWarningLevel;
  /** 关联的题目序号（1 基，便于在 UI 显示"第 7 题"），全局问题留空 */
  questionOrder?: number;
  /** 简短标题，便于在警告面板分组 */
  code:
    | "missing_answer"
    | "missing_explanation"
    | "ambiguous_type"
    | "option_mismatch"
    | "answer_option_missing"
    | "empty_stem"
    | "no_questions"
    | "parse_error"
    | "unrecognized_format";
  /** 面向用户的人类可读说明 */
  message: string;
}
