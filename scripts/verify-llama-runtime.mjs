import { createHash } from "node:crypto"
import { readFile, readdir, stat } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export function parseChecksumManifest(text) {
  const checksums = new Map()
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const match = /^([0-9a-f]{64})\s{2}([^\s].*)$/u.exec(line)
    if (!match) throw new Error(`Invalid checksum manifest line: ${rawLine}`)
    const [, hash, name] = match
    if (checksums.has(name)) throw new Error(`Duplicate checksum entry: ${name}`)
    checksums.set(name, hash)
  }
  return checksums
}

export function validateArchiveEntries(entries) {
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/")
    const parts = normalized.split("/")
    if (
      !normalized ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:/u.test(normalized) ||
      parts.some((part) => part === "..")
    ) {
      throw new Error(`Unsafe archive entry: ${entry}`)
    }
  }
}

export function verifyRuntimeFiles(files, target) {
  const names = new Set(files.map((file) => file.replaceAll("\\", "/").split("/").at(-1)))
  const required = target.includes("windows")
    ? ["llama-server.exe", "llama.dll", "ggml.dll", "ggml-base.dll"]
    : target.includes("apple")
      ? ["llama-server", "libllama.dylib", "libggml.dylib", "libggml-base.dylib"]
      : ["llama-server", "libllama.so", "libggml.so", "libggml-base.so"]
  const missing = required.filter((name) => !names.has(name))
  if (missing.length) throw new Error(`Missing runtime files: ${missing.join(", ")}`)
}

export function baseNames(files) {
  return files.map((file) => basename(file))
}

export async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

export async function listFiles(root) {
  const result = []
  async function visit(directory) {
    for (const entry of await readdir(directory)) {
      const path = `${directory}${sep}${entry}`
      if ((await stat(path)).isDirectory()) await visit(path)
      else result.push(relative(root, path).replaceAll("\\", "/"))
    }
  }
  if (isAbsolute(root)) await visit(root)
  else await visit(root)
  return result
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  if (!target) throw new Error("Usage: node scripts/verify-llama-runtime.mjs <rust-target-triple>")
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const resourceRoot = join(repositoryRoot, "src-tauri", "resources", "llama-runtime", target)
  const resourceFiles = await listFiles(resourceRoot)
  verifyRuntimeFiles(baseNames(resourceFiles), target)
  process.stdout.write(`Verified prepared llama.cpp runtime for ${target}\n`)
}
