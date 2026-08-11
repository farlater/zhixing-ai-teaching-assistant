[CmdletBinding()]
param([string]$InstallRoot = '')

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = $scriptRoot }
$installRoot = [IO.Path]::GetFullPath($InstallRoot)
$pidPath = Join-Path $installRoot 'server.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Host '知行服务当前未运行。'; exit 0 }

$serverProcessId = [int](Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue)
$serverProcess = if ($serverProcessId -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue }
if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine -like '*dist-server*server*index.js*') {
  Stop-Process -Id $serverProcessId -Force
  Write-Host '知行服务已停止。'
} else {
  Write-Host '未找到对应的知行服务进程。'
}
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
