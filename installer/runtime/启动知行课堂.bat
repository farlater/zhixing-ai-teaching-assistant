@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-Zhixing.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败，请检查 data\logs\server-error.log。
  pause
)
