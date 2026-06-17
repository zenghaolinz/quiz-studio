/**
 * DocumentBlock —— 源文档的最小结构单元。
 *
 * 导入管线先把原始文本切成带类型与位置信息的 block，再由切题器把它们聚合成 QuestionDraft。
 * block 的 index 是全局顺序号，QuestionDraft.sourceRange 用它指回原文，实现"每道题可追溯到原文位置"。
 */
export type DocumentBlockKind =
  | "question_start" // 题号行，标志一道新题开始（1. / 1、 / (1) / 第1题）
  | "option" // 选项行（A. / A、 / (A)）
  | "answer" // 答案行（答案： / 正确答案： / 参考答案：）
  | "explanation" // 解析行（解析： / 答案解析： / 分析：）
  | "text"; // 普通正文（题干延续、说明等）

export interface DocumentBlock {
  /** 全局顺序号，0 基，用于 sourceRange 引用 */
  index: number;
  kind: DocumentBlockKind;
  /** 原始文本（保留缩进与符号，便于回看） */
  rawText: string;
  /** 规范化后的文本（去多余空白、统一符号） */
  text: string;
  /** 源文件行号，1 基 */
  lineNumber: number;
  /** 仅 PDF/DOCX 等有分页的格式使用；txt/markdown 为 undefined */
  page?: number;
  /** 题号 / 选项字母 / 答案标记等结构化抽取值 */
  marker?: string;
}
