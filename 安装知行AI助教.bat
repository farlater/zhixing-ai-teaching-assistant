@echo off
setlocal
chcp 65001 >nul
title 安装辽科智学

set "INSTALL_SCRIPT=%~dp0installer\Install-Zhixing.ps1"
if not exist "%INSTALL_SCRIPT%" (
  echo [错误] 未找到安装脚本：%INSTALL_SCRIPT%
  pause
  exit /b 1
)

echo 正在启动一键安装，请不要关闭窗口……
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%"
if errorlevel 1 (
  echo.
  echo [安装失败] 请保留本窗口中的错误信息。
  pause
  exit /b 1
)

echo.
echo [安装完成] 桌面已创建“辽科智学”快捷方式。
pause
