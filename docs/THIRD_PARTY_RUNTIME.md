# Bundled llama.cpp runtime

Quiz Studio packages the inference framework but deliberately excludes GLM-OCR model weights from the installer.

## Pinned component

- Project: [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)
- Release: `b9716`
- License: MIT
- Purpose: local GLM-OCR inference through `llama-server`; a later backend links the same release through a project-owned C ABI.

The supported CPU archives and official GitHub Release SHA-256 digests are recorded in `scripts/llama-runtime-checksums.txt`. The release preparation script rejects an archive unless its digest matches both the target mapping and this repository-owned manifest.

## Reproducible preparation

Runtime artifacts are fetched only by an explicit developer or release command:

```text
npm run runtime:fetch -- x86_64-pc-windows-msvc
npm run runtime:verify -- x86_64-pc-windows-msvc
```

The script validates every archive path before extraction, requires `llama-server` and its dynamic libraries, and then prepares Tauri's target-triple sidecar plus runtime resources. Generated binaries, libraries, archives and extraction caches are ignored by Git.

Neither `npm install`, ordinary frontend builds, nor application startup downloads executable code. Release packaging must run the explicit preparation and verification commands first. Model files remain a separate, application-managed download with their own pinned hashes.

Initial validated release targets are Windows x64/ARM64, macOS x64/ARM64 and glibc Linux x64/ARM64. Other targets fail closed instead of guessing an asset.
