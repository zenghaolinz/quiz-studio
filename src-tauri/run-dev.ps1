# Launch Tauri desktop dev build.
# No Chinese literals anywhere in this script: the project root is derived from
# the script's own location, so PowerShell 5.1 reading the no-BOM file as GBK
# cannot mangle any path. vcvars path is ASCII; npm inherits PS working dir.
$ErrorActionPreference = 'Stop'

# Script lives at <project>\src-tauri\run-dev.ps1 ; project root = two levels up.
$project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if (-not (Test-Path $vcvars)) { Write-Error "MSVC vcvars64.bat not found" }
if (-not (Test-Path $project)) { Write-Error "Project directory not found" }

Set-Location $project
Write-Host ("cwd: " + (Get-Location).Path)
Write-Host "Starting npm run tauri dev ..."
cmd /c ('"' + $vcvars + '" >nul && npm run tauri dev')
