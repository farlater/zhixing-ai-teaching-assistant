@echo off
setlocal
title 知行 AI 教学诊断

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装 Node.js 20 或更高版本。
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [提示] 正在安装 pnpm...
  call npm install -g pnpm
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo [1/3] 正在安装依赖...
  call pnpm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist dist\index.html (
  echo [2/3] 正在构建生产版本...
  call pnpm build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo [3/3] 正在启动知行教学诊断...
echo 教师端: http://localhost:4173/teacher
echo 请保持本窗口开启。
call pnpm start
pause
