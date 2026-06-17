# Run `cargo test` with MSVC env. ASCII-only (no Chinese path literals):
# project\src-tauri is derived from this script's location, so PowerShell 5.1
# reading the no-BOM file as GBK cannot mangle any path.
$ErrorActionPreference = 'Stop'
$srctauri = Split-Path -Parent $MyInvocation.MyCommand.Path
$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) { Write-Error "MSVC vcvars64.bat not found" }
Set-Location $srctauri
cmd /c ('"' + $vcvars + '" >nul && cargo test ' + ($args -join ' '))
