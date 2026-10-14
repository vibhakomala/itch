# Dot-source this script to use the pinned portable Node in the current PowerShell session.
$ErrorActionPreference = 'Stop'
$itchRoot = Split-Path -Parent $PSScriptRoot
$itchNodeVersion = (Get-Content -LiteralPath (Join-Path $itchRoot '.node-version') -Raw).Trim()
if ($itchNodeVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid pinned Node version' }
$itchNodeDirectory = Join-Path $itchRoot ".tools/node-v$itchNodeVersion-win-x64"
$itchNodeExecutable = Join-Path $itchNodeDirectory 'node.exe'
if (-not (Test-Path -LiteralPath $itchNodeExecutable)) {
  $itchTools = Join-Path $itchRoot '.tools'
  New-Item -ItemType Directory -Path $itchTools -Force | Out-Null
  $itchArchiveName = "node-v$itchNodeVersion-win-x64.zip"
  $itchArchive = Join-Path $itchTools $itchArchiveName
  $itchReleaseUrl = "https://nodejs.org/dist/v$itchNodeVersion"
  Invoke-WebRequest -Uri "$itchReleaseUrl/$itchArchiveName" -OutFile $itchArchive -UseBasicParsing
  $itchChecksums = (Invoke-WebRequest -Uri "$itchReleaseUrl/SHASUMS256.txt" -UseBasicParsing).Content
  $itchExpectedLine = ($itchChecksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $itchArchiveName") })
  if (@($itchExpectedLine).Count -ne 1) { throw 'Node archive checksum is missing or ambiguous' }
  $itchExpectedHash = ($itchExpectedLine.Trim() -split '\s+')[0]
  $itchActualHash = (Get-FileHash -LiteralPath $itchArchive -Algorithm SHA256).Hash
  if ($itchActualHash -ne $itchExpectedHash) { throw 'Node archive checksum mismatch' }
  Expand-Archive -LiteralPath $itchArchive -DestinationPath $itchTools -Force
}
$env:PATH = "$itchNodeDirectory;$env:PATH"
& $itchNodeExecutable --version
