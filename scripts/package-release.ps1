$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $projectDirectory 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $buildDirectory 'index.html'))) {
  throw 'Run npm run build before packaging.'
}
$packageData = Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw | ConvertFrom-Json
$releaseDirectory = Join-Path $projectDirectory 'releases'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$archiveFile = Join-Path $releaseDirectory "IronSwarm-web-$($packageData.version).zip"
Compress-Archive -Path (Join-Path $buildDirectory '*') -DestinationPath $archiveFile -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archiveFile)
try {
  if (-not ($archive.Entries | Where-Object { $_.FullName -eq 'index.html' })) {
    throw 'Archive must contain index.html at root.'
  }
  Write-Output "Verified $($archive.Entries.Count) ZIP entries: $archiveFile"
} finally { $archive.Dispose() }
Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256 | Format-List
