/**
 * 符号规范化：全角→半角字符转换。
 *
 * 把全角数字、字母、标点转成半角，让 "A．" "A、" "A." 等等价写法能被同一套正则匹配。
 * 数学块 $...$ / $$...$$ 内的内容保持原样，不破坏 LaTeX 公式。
 */
export function toHalfWidth(input: string): string {
  let out = "";
  let inMath = false;
  for (const ch of input) {
    if (ch === "$") inMath = !inMath;
    if (inMath) {
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    // 全角数字 ０-９ (FF10-FF19) / 全角大写 Ａ-Ｚ (FF21-FF3A) / 全角小写 ａ-ｚ (FF41-FF5A)
    if (code >= 0xff10 && code <= 0xff5a) {
      out += String.fromCodePoint(code - 0xfee0);
    } else {
      switch (ch) {
        case "：": out += ":"; break;
        case "，": out += ","; break;
        case "（": out += "("; break;
        case "）": out += ")"; break;
        case "、":
        case "．": out += "."; break;
        default: out += ch;
      }
    }
  }
  return out;
}
