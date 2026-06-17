/**
 * 导入草稿数据模型。
 *
 * 这是 v0.2 最关键的数据结构。所有格式（TXT/Markdown/DOCX/PDF/OCR/AI 切题）都只产出
 * QuestionDraft[]，绝不直接写正式 Question 表。用户在预览编辑器里修正后，再经校验转换写入题库。
 *
 * 设计要点：
 * - 草稿的答案用 optionLabels（"B"）而非 optionIds，这样在编辑器里增删/重排选项后答案仍有效；
 *   最终写入题库时再映射为 optionIds。
 * - type 含 "unknown"：切题器无法判定题型时落此值，由校验层告警，强制人工确认。
 * - sourceRange 让每道题可追溯到原文 block 区间，支撑"对照原文修正"。
 */
import type { DocumentBlock } from "./document-block";
import type { ImportWarning } from "./import-warning";

export type QuestionDraftType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "essay"
  | "unknown";

export interface DraftOption {
  /** 稳定 id：a/b/c/…，由 label 小写而来；编辑器新增选项时生成 gen- 开头的临时 id */
  id: string;
  /** 显示字母 A/B/C… */
  label: string;
  contentMarkdown: string;
}

export type DraftAnswer =
  | { kind: "choice"; optionLabels: string[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "blank"; acceptedAnswers: string[][] } // 每个空一组可接受答案
  | { kind: "subjective"; referenceMarkdown: string }
  | { kind: "unknown" };

export interface SourceRange {
  page?: number;
  startBlock: number;
  endBlock: number;
}

export interface QuestionDraft {
  id: string;
  /** 题目在草稿中的顺序，0 基 */
  order: number;
  type: QuestionDraftType;
  stemMarkdown: string;
  options: DraftOption[];
  answer: DraftAnswer;
  explanationMarkdown?: string;
  sourceRange?: SourceRange;
  /** 切题置信度 0..1，规则切题恒为 1，OCR/AI 切题按置信度填充 */
  confidence: number;
  /** 本题逐条警告（题目级，区别于 ImportDraft.warnings 的全局警告） */
  warnings: string[];
}

export type ImportDraftStatus =
  | "parsing"
  | "needs_review"
  | "confirmed"
  | "failed";

export interface ImportDraft {
  id: string;
  sourceFileId: string;
  sourceName?: string;
  sourceType: "txt" | "markdown" | "docx" | "pdf" | "image";
  blocks: DocumentBlock[];
  questions: QuestionDraft[];
  warnings: ImportWarning[];
  status: ImportDraftStatus;
}
