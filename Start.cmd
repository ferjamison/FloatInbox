@echo off
setlocal
if not exist "%~dp0runtime\electron.exe" (
  call "%~dp0Setup-D.cmd"
  exit /b
)
start "" "%~dp0runtime\electron.exe" "%~dp0."
