import { invoke } from "@tauri-apps/api/core";

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || `命令 ${command} 执行失败`);
  }
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
