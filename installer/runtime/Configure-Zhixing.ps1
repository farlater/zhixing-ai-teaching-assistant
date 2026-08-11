[CmdletBinding()]
param(
  [string]$AppRoot = (Join-Path $PSScriptRoot 'app'),
  [string]$InstallRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path ([IO.Path]::GetFullPath($AppRoot)) '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  Copy-Item -LiteralPath (Join-Path $AppRoot '.env.example') -Destination $envFile -Force
}
Start-Process -FilePath 'notepad.exe' -ArgumentList @($envFile) -Wait
& (Join-Path $InstallRoot 'Stop-Zhixing.ps1') -InstallRoot $InstallRoot
& (Join-Path $InstallRoot 'Start-Zhixing.ps1') -AppRoot $AppRoot -InstallRoot $InstallRoot
