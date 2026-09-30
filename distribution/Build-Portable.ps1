param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist')
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$nodeVersion = '24.21.0'
$nodeArchiveName = "node-v$nodeVersion-win-x64.zip"
$nodeBase = "https://nodejs.org/dist/v$nodeVersion"
$buildDirectory = Join-Path $OutputDirectory ("build-" + [guid]::NewGuid().ToString('N'))
$releaseDirectory = Join-Path $buildDirectory 'ARC-Blueprint-Map-Windows-x64'
$nodeExtract = Join-Path $buildDirectory 'node-extract'
$zipPath = Join-Path $OutputDirectory 'ARC-Blueprint-Map-Windows-x64.zip'

if (Test-Path -LiteralPath $zipPath) {
    throw "Release archive already exists: $zipPath. Choose a different output directory."
}
New-Item -ItemType Directory -Path $releaseDirectory, $nodeExtract -Force | Out-Null

foreach ($name in @('Start Blueprint Map.cmd', 'Start-Blueprint-Map.ps1', 'server.mjs', 'package.json', 'README.md', 'THIRD-PARTY.md')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $releaseDirectory
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'public') -Destination $releaseDirectory -Recurse

$nodeArchive = Join-Path $buildDirectory $nodeArchiveName
$checksums = Join-Path $buildDirectory 'SHASUMS256.txt'
Invoke-WebRequest -UseBasicParsing -Uri "$nodeBase/$nodeArchiveName" -OutFile $nodeArchive
Invoke-WebRequest -UseBasicParsing -Uri "$nodeBase/SHASUMS256.txt" -OutFile $checksums
$checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match ('\s+' + [regex]::Escape($nodeArchiveName) + '$') } | Select-Object -First 1
if (-not $checksumLine) { throw 'The official Node.js checksum was not found.' }
$expectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $nodeArchive -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'The Node.js archive checksum does not match the official release.' }

Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtract
$nodeRoot = Join-Path $nodeExtract ("node-v$nodeVersion-win-x64")
$runtime = Join-Path $releaseDirectory 'runtime'
New-Item -ItemType Directory -Path $runtime | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeRoot 'node.exe') -Destination $runtime
Copy-Item -LiteralPath (Join-Path $nodeRoot 'LICENSE') -Destination $runtime

Compress-Archive -LiteralPath $releaseDirectory -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
Write-Output "Portable ZIP: $zipPath"
Write-Output "SHA256: $hash"
