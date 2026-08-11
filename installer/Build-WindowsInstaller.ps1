[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'release'),
  [string]$IsccPath = '',
  [switch]$SkipInno
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$packageRoot = Join-Path $outputDirectory 'windows-package'
$appRoot = Join-Path $packageRoot 'app'
$runtimeRoot = Join-Path $packageRoot 'runtime'

function Copy-ReleaseFiles {
  New-Item -ItemType Directory -Force -Path $appRoot, $runtimeRoot | Out-Null
  foreach ($directory in @('dist', 'dist-server', 'prompts', 'skills')) {
    $source = Join-Path $projectRoot $directory
    if (-not (Test-Path -LiteralPath $source)) { throw "缺少发布目录：$source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $appRoot $directory) -Recurse -Force
  }
  foreach ($file in @('package.json', '.env.example', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $appRoot $file) -Force
  }
  foreach ($script in @('Start-Zhixing.ps1', 'Stop-Zhixing.ps1', 'Configure-Zhixing.ps1', 'Configure-Firewall.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runtime\$script") -Destination (Join-Path $packageRoot $script) -Force
  }
  foreach ($launcher in @('启动知行课堂.bat', '停止知行课堂.bat', '配置AI服务.bat')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runtime\$launcher") -Destination (Join-Path $packageRoot $launcher) -Force
  }
}

function Install-ReleaseNode {
  $architecture = 'x64'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
  $release = $index | Where-Object { $_.lts -and $_.files -contains "win-$architecture-zip" } | Select-Object -First 1
  if (-not $release) { throw '未找到 Windows x64 Node.js LTS。' }
  $archiveName = "node-$($release.version)-win-$architecture.zip"
  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("zhixing-release-node-" + [guid]::NewGuid().ToString('N'))
  $archivePath = Join-Path $temporaryRoot $archiveName
  $extractRoot = Join-Path $temporaryRoot 'extract'
  New-Item -ItemType Directory -Force -Path $temporaryRoot, $extractRoot | Out-Null
  try {
    $baseUrl = "https://nodejs.org/dist/$($release.version)"
    Invoke-WebRequest -Uri "$baseUrl/$archiveName" -OutFile $archivePath
    $checksums = (Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt").Content
    $expectedLine = ($checksums -split "`n" | Where-Object { $_ -match [regex]::Escape($archiveName) } | Select-Object -First 1)
    $expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if (-not $expectedHash -or $actualHash -ne $expectedHash) { throw 'Node.js 发布运行时校验失败。' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    $expanded = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
    Copy-Item -Path (Join-Path $expanded.FullName '*') -Destination $runtimeRoot -Recurse -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
  }
}

if (Test-Path -LiteralPath $packageRoot) {
  $resolvedPackage = [IO.Path]::GetFullPath($packageRoot)
  if (-not $resolvedPackage.StartsWith($outputDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '发布暂存目录越界。' }
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Copy-ReleaseFiles
Install-ReleaseNode

$npmExecutable = Join-Path $runtimeRoot 'npm.cmd'
$env:Path = "$runtimeRoot;$env:Path"
Push-Location $appRoot
try {
  & $npmExecutable install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw '生产依赖安装失败。' }
} finally { Pop-Location }

$zipPath = Join-Path $outputDirectory 'ZhixingAI-Windows-Portable.zip'
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$tarExecutable = (Get-Command tar.exe -ErrorAction SilentlyContinue).Source
if ($tarExecutable) {
  & $tarExecutable -a -c -f $zipPath -C $packageRoot .
  if ($LASTEXITCODE -ne 0) { throw '便携版 ZIP 打包失败。' }
} else {
  Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
}

if (-not $SkipInno) {
  if (-not $IsccPath) {
    $candidatePaths = @(
      "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
      "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $IsccPath = $candidatePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  }
  if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath)) { throw '未找到 Inno Setup 6 的 ISCC.exe。可使用 -SkipInno 仅生成便携包。' }
  $languageFile = Join-Path $outputDirectory 'ChineseSimplified.isl'
  if (-not (Test-Path -LiteralPath $languageFile)) {
    Invoke-WebRequest -Uri 'https://jrsoftware.org/files/istrans/ChineseSimplified.isl' -OutFile $languageFile
  }
  $version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json).version
  & $IsccPath "/DSourceDir=$packageRoot" "/DOutputDir=$outputDirectory" "/DMyAppVersion=$version" "/DLanguageFile=$languageFile" (Join-Path $PSScriptRoot 'zhixing.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Inno Setup 安装包编译失败。' }
}

Write-Host "发布产物已生成：$outputDirectory" -ForegroundColor Green
