/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

function filesUnder(directory: string, suffix: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path, suffix) : path.endsWith(suffix) ? [path] : [];
  });
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split(/\r?\n/).length;
}

describe("architecture boundaries", () => {
  it("keeps page orchestrators below 300 lines", () => {
    const oversized = filesUnder(join(SRC, "pages"), ".tsx")
      .map((path) => ({ path: relative(SRC, path), lines: lineCount(path) }))
      .filter((file) => file.lines > 300);
    expect(oversized).toEqual([]);
  });

  it("keeps reusable components below 250 lines", () => {
    const oversized = filesUnder(SRC, ".tsx")
      .filter((path) => relative(SRC, path).replaceAll("\\", "/").includes("components/"))
      .map((path) => ({ path: relative(SRC, path), lines: lineCount(path) }))
      .filter((file) => file.lines > 250);
    expect(oversized).toEqual([]);
  });

  it("freezes the legacy Rust database facade until it is split by aggregate", () => {
    const databaseFacade = join(process.cwd(), "src-tauri", "src", "db", "mod.rs");
    expect(lineCount(databaseFacade)).toBeLessThan(900);
  });

  it("keeps domain modules independent from React and Tauri", () => {
    const violations = filesUnder(join(SRC, "domain"), ".ts")
      .filter((path) => !path.endsWith(".test.ts"))
      .filter((path) => /from ["']react|@tauri-apps/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path));
    expect(violations).toEqual([]);
  });
});
