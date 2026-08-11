[CmdletBinding()]
param([string]$InstallRoot = '')

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = $scriptRoot }
$installRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$localPrograms = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs')).TrimEnd('\')
if (-not $installRoot.StartsWith($localPrograms + '\', [StringComparison]::OrdinalIgnoreCase) -or $installRoot.Length -le $localPrograms.Length + 3) {
  throw "拒绝卸载不安全的目录：$installRoot"
}

$answer = Read-Host '将卸载知行 AI 教学诊断。输入 YES 确认（课程数据与配置也会删除）'
if ($answer -ne 'YES') { Write-Host '已取消卸载。'; exit 0 }

& (Join-Path $installRoot 'Stop-Zhixing.ps1') -InstallRoot $installRoot
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '知行 AI 教学诊断.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) '知行 AI 教学诊断'
if (Test-Path -LiteralPath $desktopShortcut) { Remove-Item -LiteralPath $desktopShortcut -Force }
if (Test-Path -LiteralPath $startMenu) { Remove-Item -LiteralPath $startMenu -Recurse -Force }

Write-Host '正在删除安装文件……'
Set-Location $env:TEMP
Remove-Item -LiteralPath $installRoot -Recurse -Force
Write-Host '卸载完成。'
