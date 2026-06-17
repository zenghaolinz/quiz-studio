/**
 * 文本规范化：编码无关的预处理。
 *
 * 职责：去 BOM、统一行尾、压空白、按行切分、单行规范化。
 * 不碰数学公式内部空白（保护 $...$ / $$...$$）。
 */
import { toHalfWidth } from "./normalize-symbols";

/** 去掉 UTF-8 BOM。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 统一换行为 \n，去掉 \r。 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * 压缩行内空白：首尾 trim，内部连续空白压成单空格；保护数学块。
 *
 * 用私用区字符 U+E000 / U+E001 做无空格占位符，避免占位符的边界空格被
 * trim/折叠或还原时吃掉，从而防止 "$x=1$" 被误改成 "MATH0" 或与相邻文字粘连。
 */
const MATH_OPEN = String.fromCharCode(0xe000);
const MATH_CLOSE = String.fromCharCode(0xe001);
const MATH_PLACEHOLDER = new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, "g");

export function collapseWhitespace(line: string): string {
  const mathChunks: string[] = [];
  const protectedLine = line.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (m) => {
    mathChunks.push(m);
    return `${MATH_OPEN}${mathChunks.length - 1}${MATH_CLOSE}`;
  });
  // 折叠普通空格、制表符、全角空格 U+3000、NBSP 等
  const collapsed = protectedLine.trim().replace(/[\s　]+/g, " ");
  return collapsed.replace(MATH_PLACEHOLDER, (_m, i) => mathChunks[Number(i)] ?? "");
}

/** 规范化单行：全角转半角 + 空白归一。 */
export function normalizeLine(line: string): string {
  return collapseWhitespace(toHalfWidth(line));
}

export interface SplitLine {
  /** 1 基行号 */
  lineNumber: number;
  raw: string;
  normalized: string;
}

/**
 * 把整篇文本切成行，跳过纯空行（但保留行号连续性）。
 * 返回的非空行已做规范化。
 */
export function splitLines(text: string): SplitLine[] {
  const clean = normalizeNewlines(stripBom(text));
  const lines = clean.split("\n");
  const result: SplitLine[] = [];
  lines.forEach((raw, i) => {
    const normalized = normalizeLine(raw);
    if (normalized.length > 0) result.push({ lineNumber: i + 1, raw, normalized });
  });
  return result;
}
