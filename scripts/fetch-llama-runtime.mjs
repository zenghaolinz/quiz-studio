import { spawnSync } from "node:child_process"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  listFiles,
  parseChecksumManifest,
  sha256File,
  validateArchiveEntries,
  verifyRuntimeFiles,
} from "./verify-llama-runtime.mjs"

export const LLAMA_RELEASE = "b9716"
const RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}`

const ASSETS = {
  "x86_64-pc-windows-msvc": [
    "llama-b9716-bin-win-cpu-x64.zip",
    "e037cdcf34e9f7a38548e65be5a5c3d1ea96ef7ac951485c4f0b25e9e93ab7f4",
  ],
  "aarch64-pc-windows-msvc": [
    "llama-b9716-bin-win-cpu-arm64.zip",
    "a5cbf38d49f2f02bab9a341a851a084984a759880e327e58c5be8288e3f62148",
  ],
  "aarch64-apple-darwin": [
    "llama-b9716-bin-macos-arm64.tar.gz",
    "17b73b07908ca8b3e3b5b6f11b889701985f19bc7e425cc2ca9eefc280ebc39e",
  ],
  "x86_64-apple-darwin": [
    "llama-b9716-bin-macos-x64.tar.gz",
    "680f94adff527fa44934947eac0df999363f74d1241ee864a14a84a9ef925dfe",
  ],
  "x86_64-unknown-linux-gnu": [
    "llama-b9716-bin-ubuntu-x64.tar.gz",
    "77e9b191c09479001e4d93514e87bd3e849c413eaa2f2b241fd11d202159cd81",
  ],
  "aarch64-unknown-linux-gnu": [
    "llama-b9716-bin-ubuntu-arm64.tar.gz",
    "3023c64da2542195cfecdf24f49127582128715b8ac58c6a6a4185b7ab83d078",
  ],
}

export function runtimeTargetForHost(platform = process.platform, architecture = process.arch) {
  const targets = {
    "win32:x64": "x86_64-pc-windows-msvc",
    "win32:arm64": "aarch64-pc-windows-msvc",
    "darwin:x64": "x86_64-apple-darwin",
    "darwin:arm64": "aarch64-apple-darwin",
    "linux:x64": "x86_64-unknown-linux-gnu",
    "linux:arm64": "aarch64-unknown-linux-gnu",
  }
  const target = targets[`${platform}:${architecture}`]
  if (!target) throw new Error(`Unsupported llama.cpp runtime host: ${platform}/${architecture}`)
  return target
}

export function runtimeAssetForTarget(target) {
  const value = ASSETS[target]
  if (!value) throw new Error(`Unsupported llama.cpp runtime target: ${target}`)
  return { archive: value[0], sha256: value[1], url: `${RELEASE_BASE}/${value[0]}` }
}

function runTar(args) {
  const result = spawnSync("tar", args, { encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || `tar failed: ${args.join(" ")}`)
  return result.stdout
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) throw new Error(`Runtime download failed: HTTP ${response.status}`)
  await writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

export async function prepareRuntime(target, repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const asset = runtimeAssetForTarget(target)
  const checksums = parseChecksumManifest(
    await readFile(join(repositoryRoot, "scripts", "llama-runtime-checksums.txt"), "utf8"),
  )
  if (checksums.get(asset.archive) !== asset.sha256) {
    throw new Error(`Repository checksum does not match pinned asset: ${asset.archive}`)
  }

  const cache = join(repositoryRoot, "src-tauri", "runtime-cache", target)
  const archivePath = join(cache, asset.archive)
  const extracted = join(cache, "extracted")
  await mkdir(cache, { recursive: true })
  let cachedArchiveIsValid = false
  try {
    cachedArchiveIsValid = (await sha256File(archivePath)) === asset.sha256
  } catch {
    // The first preparation has no cached archive.
  }
  if (!cachedArchiveIsValid) {
    await download(asset.url, archivePath)
    if ((await sha256File(archivePath)) !== asset.sha256) throw new Error("Runtime checksum mismatch")
  }

  const entries = runTar(["-tf", archivePath]).split(/\r?\n/u).filter(Boolean)
  validateArchiveEntries(entries)
  await rm(extracted, { recursive: true, force: true })
  await mkdir(extracted, { recursive: true })
  runTar(["-xf", archivePath, "-C", extracted])
  const files = await listFiles(extracted)
  verifyRuntimeFiles(files, target)

  const resourceDestination = join(repositoryRoot, "src-tauri", "resources", "llama-runtime", target)
  await rm(resourceDestination, { recursive: true, force: true })
  await mkdir(resourceDestination, { recursive: true })
  for (const file of files) {
    await cp(join(extracted, file), join(resourceDestination, basename(file)))
  }
  return { target, resourceDestination }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2] || runtimeTargetForHost()
  const prepared = await prepareRuntime(target)
  process.stdout.write(`Prepared llama.cpp ${LLAMA_RELEASE} for ${prepared.target}\n`)
}
