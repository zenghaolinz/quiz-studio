@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d "D:\项目\quiz_studio_foundation\src-tauri"
cargo check %*
