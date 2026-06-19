import { describe, expect, test } from "vitest"

import { LLAMA_RELEASE, runtimeAssetForTarget } from "./fetch-llama-runtime.mjs"
import {
  baseNames,
  parseChecksumManifest,
  validateArchiveEntries,
  verifyRuntimeFiles,
} from "./verify-llama-runtime.mjs"

describe("pinned llama.cpp runtime artifacts", () => {
  test("maps supported Rust target triples to b9716 CPU archives", () => {
    expect(LLAMA_RELEASE).toBe("b9716")
    expect(runtimeAssetForTarget("x86_64-pc-windows-msvc")).toMatchObject({
      archive: "llama-b9716-bin-win-cpu-x64.zip",
      sha256: "e037cdcf34e9f7a38548e65be5a5c3d1ea96ef7ac951485c4f0b25e9e93ab7f4",
    })
    expect(runtimeAssetForTarget("aarch64-apple-darwin").archive).toBe(
      "llama-b9716-bin-macos-arm64.tar.gz",
    )
    expect(() => runtimeAssetForTarget("wasm32-unknown-unknown")).toThrow(/unsupported/i)
  })

  test("parses strict repository-owned checksums", () => {
    expect(parseChecksumManifest("a".repeat(64) + "  runtime.zip\n")).toEqual(
      new Map([["runtime.zip", "a".repeat(64)]]),
    )
    expect(() => parseChecksumManifest("not-a-hash runtime.zip")).toThrow(/checksum/i)
    expect(() =>
      parseChecksumManifest(`${"a".repeat(64)}  same.zip\n${"b".repeat(64)}  same.zip`),
    ).toThrow(/duplicate/i)
  })

  test("rejects archive traversal before extraction", () => {
    expect(() => validateArchiveEntries(["bin/llama-server.exe", "../outside.dll"])).toThrow(
      /unsafe/i,
    )
    expect(() => validateArchiveEntries(["C:\\outside.dll"])).toThrow(/unsafe/i)
    expect(validateArchiveEntries(["bin/llama-server.exe", "bin/llama.dll"])).toBeUndefined()
  })

  test("requires the server and its dynamic libraries", () => {
    expect(baseNames(["bin/llama.dll", "bin/ggml.dll"])).toEqual(["llama.dll", "ggml.dll"])
    expect(() =>
      verifyRuntimeFiles(
        ["llama-server.exe", "llama.dll", "ggml.dll", "ggml-base.dll"],
        "x86_64-pc-windows-msvc",
      ),
    ).not.toThrow()
    expect(() =>
      verifyRuntimeFiles(["llama-server.exe", "llama.dll"], "x86_64-pc-windows-msvc"),
    ).toThrow(/missing/i)
  })
})
