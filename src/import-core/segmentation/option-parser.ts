/**
 * 选项解析。
 *
 * 规范化后的选项行形态（、／． 已转 .，（）已转 ()）：
 *   A. 选项内容     A) 选项内容     (A) 选项内容     a. 选项内容
 * 匹配后抽出 label（A/B/C…）与内容。label→id 用小写，与正式 Question 模型一致。
 */

const OPTION_LINE = /^(?:([A-Za-z])[.)]\s*|[(]([A-Za-z])[)]\s*)(.*)$/;

export interface ParsedOption {
  label: string;
  content: string;
}

/** 判断一行是否为选项行；是则返回 label（大写）与内容。 */
export function matchOption(normalizedLine: string): ParsedOption | null {
  const m = OPTION_LINE.exec(normalizedLine);
  if (!m) return null;
  const label = (m[1] ?? m[2] ?? "").toUpperCase();
  if (!label) return null;
  return { label, content: (m[3] ?? "").trim() };
}

/** label（A）→ 稳定 id（a），与正式 QuestionOption.id 对齐。 */
export function labelToId(label: string): string {
  return label.toLowerCase();
}

/** 为编辑器新增的选项生成临时 id（避免与规则解析的 a/b/c 冲突）。 */
export function generateOptionId(existing: DraftOptionLike[]): string {
  const used = new Set(existing.map((o) => o.id));
  let n = 1;
  while (used.has(`gen-${n}`)) n++;
  return `gen-${n}`;
}

interface DraftOptionLike {
  id: string;
}
