$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $projectDirectory 'releases'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$projectArchive = Join-Path $releaseDirectory 'IronSwarm-GDevelop-1.2.0.zip'
$names = @('game.json','resources','src','public','tests','scripts','docs','qa','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','README.txt','.gitignore')
$inputs = $names | ForEach-Object { Join-Path $projectDirectory $_ } | Where-Object { Test-Path -LiteralPath $_ }
Compress-Archive -LiteralPath $inputs -DestinationPath $projectArchive -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($projectArchive)
try {
  if (-not ($archive.Entries | Where-Object FullName -eq 'game.json')) { throw 'Missing game.json at ZIP root.' }
  if (-not ($archive.Entries | Where-Object { $_.FullName.Replace('\','/') -eq 'resources/iron-swarm-package.json' })) { throw 'Missing game package.' }
  Write-Output "Verified $($archive.Entries.Count) project entries: $projectArchive"
} finally { $archive.Dispose() }
$exportDirectory = Join-Path $projectDirectory 'export'
if (Test-Path -LiteralPath (Join-Path $exportDirectory 'index.html')) {
  $webArchive = Join-Path $releaseDirectory 'IronSwarm-GDevelop-HTML5-1.2.0.zip'
  Compress-Archive -Path (Join-Path $exportDirectory '*') -DestinationPath $webArchive -Force
  Write-Output "HTML5 archive: $webArchive"
}
