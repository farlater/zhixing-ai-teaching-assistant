[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\ZhixingAI'),
  [switch]$SkipShortcuts,
  [switch]$SkipFirewall,
  [switch]$SkipLaunch,
  [switch]$UseExistingBuild,
  [string]$ExistingNodeExecutable = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-SafeInstallRoot([string]$Path) {
  $resolved = [IO.Path]::GetFullPath($Path)
  $root = [IO.Path]::GetPathRoot($resolved)
  if ($resolved -eq $root -or $resolved.Length -lt 12) {
    throw "安装目录不安全：$resolved"
  }
  return $resolved.TrimEnd('\')
}

function Copy-ProjectSource([string]$SourceRoot, [string]$TargetRoot) {
  $files = @('.env.example', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'README.md', 'tsconfig.json', 'tsconfig.server.json', 'vite.config.ts')
  $directories = @('prompts', 'public', 'server', 'shared', 'skills', 'src')
  foreach ($file in $files) {
    $source = Join-Path $SourceRoot $file
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $TargetRoot $file) -Force }
  }
  foreach ($directory in $directories) {
    $source = Join-Path $SourceRoot $directory
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $TargetRoot $directory) -Recurse -Force }
  }
}

function Install-PortableNode([string]$RuntimeRoot, [string]$ProvidedNode) {
  $nodeExecutable = Join-Path $RuntimeRoot 'node.exe'
  $npmExecutable = Join-Path $RuntimeRoot 'npm.cmd'
  if (Test-Path -LiteralPath $nodeExecutable) { return }

  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  if ($ProvidedNode) {
    $provided = [IO.Path]::GetFullPath($ProvidedNode)
    if (-not (Test-Path -LiteralPath $provided)) { throw "测试 Node 不存在：$provided" }
    Copy-Item -LiteralPath $provided -Destination $nodeExecutable -Force
    return
  }

  Write-Step '下载并校验 Node.js LTS 便携运行时'
  $architecture = if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq [Runtime.InteropServices.Architecture]::Arm64) { 'arm64' } else { 'x64' }
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
  $release = $index | Where-Object { $_.lts -and $_.files -contains "win-$architecture-zip" } | Select-Object -First 1
  if (-not $release) { throw "未找到适用于 win-$architecture 的 Node.js LTS。" }
  $archiveName = "node-$($release.version)-win-$architecture.zip"
  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ("zhixing-node-" + [guid]::NewGuid().ToString('N'))
  $archivePath = Join-Path $downloadRoot $archiveName
  $extractRoot = Join-Path $downloadRoot 'extract'
  New-Item -ItemType Directory -Force -Path $downloadRoot, $extractRoot | Out-Null
  try {
    $baseUrl = "https://nodejs.org/dist/$($release.version)"
    Invoke-WebRequest -Uri "$baseUrl/$archiveName" -OutFile $archivePath
    $checksums = (Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt").Content
    $expectedLine = ($checksums -split "`n" | Where-Object { $_ -match [regex]::Escape($archiveName) } | Select-Object -First 1)
    if (-not $expectedLine) { throw 'Node.js 校验文件中未找到目标压缩包。' }
    $expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw 'Node.js 运行时 SHA256 校验失败。' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    $expanded = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
    if (-not $expanded) { throw 'Node.js 运行时解压失败。' }
    Copy-Item -Path (Join-Path $expanded.FullName '*') -Destination $RuntimeRoot -Recurse -Force
  } finally {
    if (Test-Path -LiteralPath $downloadRoot) { Remove-Item -LiteralPath $downloadRoot -Recurse -Force }
  }
  if (-not (Test-Path -LiteralPath $nodeExecutable) -or -not (Test-Path -LiteralPath $npmExecutable)) {
    throw 'Node.js 便携运行时不完整。'
  }
}

function Stop-InstalledServer([string]$Root) {
  $pidPath = Join-Path $Root 'server.pid'
  if (-not (Test-Path -LiteralPath $pidPath)) { return }
  $serverProcessId = [int](Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue)
  if ($serverProcessId -gt 0) {
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
    if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine -like '*dist-server*server*index.js*') {
      Stop-Process -Id $serverProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

function New-ApplicationShortcut([string]$ShortcutPath, [string]$ScriptPath, [string]$Arguments, [string]$WorkingDirectory) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass $Arguments -File `"$ScriptPath`""
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
  $shortcut.Save()
}

if ($env:OS -ne 'Windows_NT') { throw '一键安装仅支持 Windows。' }
$sourceRoot = Split-Path $PSScriptRoot -Parent
$installRoot = Assert-SafeInstallRoot $InstallRoot
$appRoot = Join-Path $installRoot 'app'
$runtimeRoot = Join-Path $installRoot 'runtime'
$stagingRoot = Join-Path (Split-Path $installRoot -Parent) ("ZhixingAI-app-staging-" + [guid]::NewGuid().ToString('N'))
$backupRoot = Join-Path (Split-Path $installRoot -Parent) ("ZhixingAI-app-backup-" + [guid]::NewGuid().ToString('N'))

Write-Step "安装到 $installRoot"
New-Item -ItemType Directory -Force -Path $installRoot, $stagingRoot | Out-Null
try {
  Stop-InstalledServer -Root $installRoot
  Copy-ProjectSource -SourceRoot $sourceRoot -TargetRoot $stagingRoot

  if (Test-Path -LiteralPath $appRoot) {
    foreach ($persistent in @('data', 'uploads', '.env')) {
      $oldPath = Join-Path $appRoot $persistent
      if (Test-Path -LiteralPath $oldPath) { Copy-Item -LiteralPath $oldPath -Destination (Join-Path $stagingRoot $persistent) -Recurse -Force }
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $stagingRoot '.env.example') -Destination (Join-Path $stagingRoot '.env') -Force
  }

  Install-PortableNode -RuntimeRoot $runtimeRoot -ProvidedNode $ExistingNodeExecutable
  $nodeExecutable = Join-Path $runtimeRoot 'node.exe'

  if ($UseExistingBuild) {
    Write-Step '复制当前已验证的生产构建（测试模式）'
    foreach ($builtDirectory in @('dist', 'dist-server', 'node_modules')) {
      $builtPath = Join-Path $sourceRoot $builtDirectory
      if (-not (Test-Path -LiteralPath $builtPath)) { throw "缺少已构建目录：$builtPath" }
      Copy-Item -LiteralPath $builtPath -Destination (Join-Path $stagingRoot $builtDirectory) -Recurse -Force
    }
  } else {
    $npmExecutable = Join-Path $runtimeRoot 'npm.cmd'
    Write-Step '安装项目依赖'
    Push-Location $stagingRoot
    try {
      $env:Path = "$runtimeRoot;$env:Path"
      & $npmExecutable install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw '项目依赖安装失败。' }
      Write-Step '构建生产版本'
      & $npmExecutable run build
      if ($LASTEXITCODE -ne 0) { throw '生产版本构建失败。' }
      & $npmExecutable prune --omit=dev --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw '生产依赖整理失败。' }
    } finally { Pop-Location }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot 'dist\index.html')) -or -not (Test-Path -LiteralPath (Join-Path $stagingRoot 'dist-server\server\index.js'))) {
    throw '生产构建产物不完整。'
  }

  Write-Step '安装启动与维护工具'
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\Start-Zhixing.ps1') -Destination (Join-Path $installRoot 'Start-Zhixing.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\Stop-Zhixing.ps1') -Destination (Join-Path $installRoot 'Stop-Zhixing.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\Configure-Zhixing.ps1') -Destination (Join-Path $installRoot 'Configure-Zhixing.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\Uninstall-Zhixing.ps1') -Destination (Join-Path $installRoot 'Uninstall-Zhixing.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\Configure-Firewall.ps1') -Destination (Join-Path $installRoot 'Configure-Firewall.ps1') -Force

  if (Test-Path -LiteralPath $appRoot) { Move-Item -LiteralPath $appRoot -Destination $backupRoot }
  Move-Item -LiteralPath $stagingRoot -Destination $appRoot
  if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }

  if (-not $SkipShortcuts) {
    Write-Step '创建桌面和开始菜单快捷方式'
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) '辽科智学'
    New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
    Remove-Item -LiteralPath (Join-Path $desktop '知行 AI 教学诊断.lnk') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) '知行 AI 教学诊断') -Recurse -Force -ErrorAction SilentlyContinue
    New-ApplicationShortcut -ShortcutPath (Join-Path $desktop '辽科智学.lnk') -ScriptPath (Join-Path $installRoot 'Start-Zhixing.ps1') -Arguments '-WindowStyle Hidden' -WorkingDirectory $appRoot
    New-ApplicationShortcut -ShortcutPath (Join-Path $startMenu '启动辽科智学.lnk') -ScriptPath (Join-Path $installRoot 'Start-Zhixing.ps1') -Arguments '-WindowStyle Hidden' -WorkingDirectory $appRoot
    New-ApplicationShortcut -ShortcutPath (Join-Path $startMenu '配置 AI 服务.lnk') -ScriptPath (Join-Path $installRoot 'Configure-Zhixing.ps1') -Arguments '' -WorkingDirectory $appRoot
    New-ApplicationShortcut -ShortcutPath (Join-Path $startMenu '停止本地服务.lnk') -ScriptPath (Join-Path $installRoot 'Stop-Zhixing.ps1') -Arguments '' -WorkingDirectory $appRoot
    New-ApplicationShortcut -ShortcutPath (Join-Path $startMenu '卸载辽科智学.lnk') -ScriptPath (Join-Path $installRoot 'Uninstall-Zhixing.ps1') -Arguments '' -WorkingDirectory $installRoot
  }

  if (-not $SkipFirewall) {
    Write-Step '请求配置局域网访问规则（会显示一次 Windows 授权窗口）'
    $firewallScript = Join-Path $installRoot 'Configure-Firewall.ps1'
    try {
      $argumentList = "-NoProfile -ExecutionPolicy Bypass -File `"$firewallScript`" -NodePath `"$nodeExecutable`" -Port 4173"
      Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentList -Wait
    } catch {
      Write-Warning '未能创建防火墙规则；首次启动时请在 Windows 提示中允许专用网络访问。'
    }
  }

  if (-not $SkipLaunch) {
    Write-Step '启动辽科智学'
    & (Join-Path $installRoot 'Start-Zhixing.ps1') -AppRoot $appRoot -InstallRoot $installRoot
  }
  Write-Host "`n安装完成。教师端：http://127.0.0.1:4173/teacher" -ForegroundColor Green
} catch {
  if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
  if ((Test-Path -LiteralPath $backupRoot) -and -not (Test-Path -LiteralPath $appRoot)) { Move-Item -LiteralPath $backupRoot -Destination $appRoot }
  if ((Test-Path -LiteralPath $appRoot) -and (Test-Path -LiteralPath (Join-Path $installRoot 'Start-Zhixing.ps1'))) {
    try { & (Join-Path $installRoot 'Start-Zhixing.ps1') -AppRoot $appRoot -InstallRoot $installRoot -NoBrowser } catch { }
  }
  throw
}
