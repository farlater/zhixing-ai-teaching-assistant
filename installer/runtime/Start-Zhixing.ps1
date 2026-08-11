[CmdletBinding()]
param(
  [string]$AppRoot = '',
  [string]$InstallRoot = '',
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = $scriptRoot }
if ([string]::IsNullOrWhiteSpace($AppRoot)) { $AppRoot = Join-Path $InstallRoot 'app' }
$appRoot = [IO.Path]::GetFullPath($AppRoot)
$installRoot = [IO.Path]::GetFullPath($InstallRoot)
$nodeExecutable = Join-Path $installRoot 'runtime\node.exe'
$serverEntry = Join-Path $appRoot 'dist-server\server\index.js'
$healthUrl = "http://127.0.0.1:$Port/api/health"
$teacherUrl = "http://127.0.0.1:$Port/teacher"
$pidPath = Join-Path $installRoot 'server.pid'

if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw "Node.js 运行时不存在：$nodeExecutable" }
if (-not (Test-Path -LiteralPath $serverEntry)) { throw "服务入口不存在：$serverEntry" }

$running = $false
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  $running = [bool]$health
} catch { $running = $false }

if (-not $running) {
  $logRoot = Join-Path $appRoot 'data\logs'
  New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
  $env:PORT = [string]$Port
  $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @($serverEntry) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'server-output.log') -RedirectStandardError (Join-Path $logRoot 'server-error.log')
  Set-Content -LiteralPath $pidPath -Value $serverProcess.Id -Encoding ascii
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($health) { $running = $true; break }
    } catch { }
  }
}

if (-not $running) { throw "服务未能启动，请查看 $appRoot\data\logs\server-error.log" }
if (-not $NoBrowser) {
  $explorer = Join-Path $env:SystemRoot 'explorer.exe'
  Start-Process -FilePath $explorer -ArgumentList @($teacherUrl)
}
