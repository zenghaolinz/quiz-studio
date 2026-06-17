/**
 * TXT 解析器：纯文本 → DocumentBlock[] → QuestionDraft[]。
 *
 * 编码检测与读取由调用方（Rust 侧 / 前端 FileReader）负责，本模块只接收已解码的字符串。
 * 行级规范化（BOM、全角、空白）在 normalize 层完成，这里负责分类与分组。
 */
import type { DocumentBlock } from "../types/document-block";
import type { QuestionDraft } from "../types/question-draft";
import { splitLines } from "../normalize/normalize-text";
import { classifyLine, groupBlocksIntoDrafts } from "../segmentation/question-boundary";

export interface ParsedDocument {
  blocks: DocumentBlock[];
  questions: QuestionDraft[];
}

export function parseTxt(text: string): ParsedDocument {
  const lines = splitLines(text);
  const blocks: DocumentBlock[] = lines.map((line, i) =>
    classifyLine(line.normalized, i, line.lineNumber, line.raw),
  );
  const questions = groupBlocksIntoDrafts(blocks);
  return { blocks, questions };
}
