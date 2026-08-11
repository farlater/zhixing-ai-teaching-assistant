[CmdletBinding()]
param(
  [string]$AppRoot = '',
  [string]$InstallRoot = '',
  [switch]$NoEditor,
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = $scriptRoot }
if ([string]::IsNullOrWhiteSpace($AppRoot)) { $AppRoot = Join-Path $InstallRoot 'app' }
$AppRoot = [IO.Path]::GetFullPath($AppRoot)
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$envFile = Join-Path ([IO.Path]::GetFullPath($AppRoot)) '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  Copy-Item -LiteralPath (Join-Path $AppRoot '.env.example') -Destination $envFile -Force
}
if ($NoEditor) {
  Write-Host "API 配置文件：$envFile"
} else {
  Start-Process -FilePath 'notepad.exe' -ArgumentList @($envFile) -Wait
}
if (-not $NoRestart) {
  & (Join-Path $InstallRoot 'Stop-Zhixing.ps1') -InstallRoot $InstallRoot
  & (Join-Path $InstallRoot 'Start-Zhixing.ps1') -AppRoot $AppRoot -InstallRoot $InstallRoot
}
