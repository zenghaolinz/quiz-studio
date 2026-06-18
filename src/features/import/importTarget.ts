export type ImportTargetMode = "new" | "existing";

export type ImportTarget =
  | { kind: "new"; name: string }
  | { kind: "existing"; bankId: string };

export function resolveImportTarget(
  mode: ImportTargetMode,
  newBankName: string,
  targetBankId: string,
): ImportTarget {
  if (mode === "new") {
    const name = newBankName.trim();
    if (!name) throw new Error("请输入新题库名称");
    return { kind: "new", name };
  }
  if (!targetBankId) throw new Error("请选择已有题库");
  return { kind: "existing", bankId: targetBankId };
}
