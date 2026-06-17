import { open } from "@tauri-apps/plugin-dialog";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";

export interface ReadTextFileResult {
  content: string;
  encoding: string;
}

export interface PickedTextFileResult extends ReadTextFileResult {
  sourceName: string;
  sourceFileId: string;
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

/** 读取文本文件，Tauri 后端按 UTF-8/GBK 解码。 */
export async function readTextFile(path: string): Promise<ReadTextFileResult> {
  return invokeCommand<ReadTextFileResult>("read_text_file", { path });
}

function pickBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,text/plain,text/markdown";
    input.style.display = "none";

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function decodeBrowserText(bytes: ArrayBuffer): ReadTextFileResult {
  try {
    return {
      content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    try {
      return {
        content: new TextDecoder("gbk", { fatal: true }).decode(bytes),
        encoding: "gbk",
      };
    } catch {
      throw new Error("文件既非合法 UTF-8 也非合法 GBK，请另存为 UTF-8 后重试");
    }
  }
}

/**
 * 选择并读取题库文本。
 * - Tauri：系统文件对话框 + Rust 文件读取；
 * - 浏览器开发模式：原生 file input + ArrayBuffer 解码。
 *
 * 这样 `npm run dev` 也能完整验证导入 UI，不再出现按钮被禁用、点击无反应。
 */
export async function pickAndReadTextFile(): Promise<PickedTextFileResult | null> {
  if (isTauriRuntime()) {
    const path = await pickTextFile();
    if (!path) return null;
    const read = await readTextFile(path);
    return {
      ...read,
      sourceName: path.split(/[\\/]/).pop() ?? path,
      sourceFileId: path,
    };
  }

  const file = await pickBrowserFile();
  if (!file) return null;
  const read = decodeBrowserText(await file.arrayBuffer());
  return {
    ...read,
    sourceName: file.name,
    sourceFileId: `browser:${file.name}:${file.size}:${file.lastModified}`,
  };
}

/** 推断 sourceType：.md/.markdown → markdown，其余 → txt。 */
export function inferSourceType(filename: string): "txt" | "markdown" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "txt";
}
