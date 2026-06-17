import { open } from "@tauri-apps/plugin-dialog";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";

export interface ReadTextFileResult {
  content: string;
  encoding: string;
}

/** 调用系统文件选择框，限定 txt/md/markdown。返回路径或 null（用户取消）。 */
export async function pickTextFile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    multiple: false,
    filters: [{ name: "文本题库", extensions: ["txt", "md", "markdown"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** 读取文本文件，后端按 UTF-8/GBK 解码。 */
export async function readTextFile(path: string): Promise<ReadTextFileResult> {
  return invokeCommand<ReadTextFileResult>("read_text_file", { path });
}

/** 推断 sourceType：.md/.markdown → markdown，其余 → txt。 */
export function inferSourceType(filename: string): "txt" | "markdown" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "txt";
}
