/**
 * Markdown 解析器：剥离 Markdown 语法后复用 TXT 切题管线。
 *
 * 剥离规则（保守，保护数学公式）：
 * - 标题井号 `#` / `##` → 去掉前导 # 与空格
 * - 强调 `**x**` / `__x__` / `*x*` / `_x_` → x
 * - 行内代码 `` `x` `` → x；代码围栏 ``` 行整行去掉
 * - 链接 `[text](url)` → text；图片 `![alt](url)` → 去掉
 * - 引用 `> ` → 去掉前导
 * - 无序列表标记 `- ` / `* ` / `+ ` 行首 → 去掉（但 `1. ` 保留，因它是题号）
 * $...$ / $$...$$ 数学块原样保留。
 */
import type { QuestionDraft } from "../types/question-draft";
import type { DocumentBlock } from "../types/document-block";
import { parseTxt, type ParsedDocument } from "./txt-parser";

const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);
const PLACEHOLDER = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");

function stripInlineMarkdown(line: string): string {
  let out = line;
  // 保护数学块（私用区字符占位，避免边界空格被后续替换吃掉）
  const math: string[] = [];
  out = out.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (m) => {
    math.push(m);
    return `${OPEN}${math.length - 1}${CLOSE}`;
  });
  // 图片 ![alt](url) → 删除
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // 链接 [text](url) → text
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 行内代码 `x` → x
  out = out.replace(/`([^`]*)`/g, "$1");
  // 粗体 **x** / __x__
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  // 斜体 *x* / _x_（避免误伤 ** 已处理后的残留）
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2");
  // 还原数学块
  out = out.replace(PLACEHOLDER, (_m, i) => math[Number(i)] ?? "");
  return out;
}

function stripMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    // 代码围栏开关
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      // 围栏内原样保留（可能是代码题干），但不参与题号切分；这里保留为正文
      out.push(raw);
      continue;
    }
    let line = raw;
    // 标题井号
    line = line.replace(/^\s{0,3}#{1,6}\s*/, "");
    // 引用前导
    line = line.replace(/^\s*>\s?/, "");
    // 无序列表标记 - * +（保留有序 1. 作为题号）
    line = line.replace(/^\s*[-*+]\s+/, "");
    line = stripInlineMarkdown(line);
    out.push(line);
  }
  return out.join("\n");
}

export function parseMarkdown(text: string): ParsedDocument {
  return parseTxt(stripMarkdown(text));
}

// 仅为类型对齐导出，便于 index 聚合
export type { ParsedDocument, DocumentBlock, QuestionDraft };
