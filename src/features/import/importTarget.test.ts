import { describe, expect, it } from "vitest";
import { resolveImportTarget } from "./importTarget";

describe("resolveImportTarget", () => {
  it("defaults to a named new bank", () => {
    expect(resolveImportTarget("new", "  OCR 题库 ", "")).toEqual({ kind: "new", name: "OCR 题库" });
  });

  it("requires a new-bank name", () => {
    expect(() => resolveImportTarget("new", " ", "")).toThrow("请输入新题库名称");
  });

  it("requires a selected existing bank", () => {
    expect(() => resolveImportTarget("existing", "ignored", "")).toThrow("请选择已有题库");
  });
});
