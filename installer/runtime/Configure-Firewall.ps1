[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -NodePath `"$NodePath`" -Port $Port"
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait
  exit 0
}

$ruleName = '知行 AI 教学诊断（局域网）'
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program ([IO.Path]::GetFullPath($NodePath)) -Profile Private | Out-Null
