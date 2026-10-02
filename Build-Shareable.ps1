param(
    [switch]$Portable
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$outputRoot = Join-Path $projectRoot 'dist'
$sourceRoot = Join-Path $outputRoot ("arc-blueprint-map-source-" + [guid]::NewGuid().ToString('N'))
$publicRoot = Join-Path $sourceRoot 'public'
New-Item -ItemType Directory -Path $publicRoot -Force | Out-Null

function Replace-ExactlyOnce([string]$content, [string]$pattern, [string]$replacement) {
    $matches = [regex]::Matches($content, $pattern, [Text.RegularExpressions.RegexOptions]::Singleline)
    if ($matches.Count -ne 1) { throw "Expected one match while removing private prototype content; found $($matches.Count): $pattern" }
    return [regex]::Replace($content, $pattern, $replacement, [Text.RegularExpressions.RegexOptions]::Singleline)
}

foreach ($name in @('package.json', 'server.mjs', 'ARC-Blueprint-Map-How-It-Works.svg', 'ARC-Blueprint-Map-How-It-Works.png')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $sourceRoot
}
foreach ($name in @('analysis-client.js', 'analysis-image.js', 'analysis-worker.js', 'backup.js', 'blueprint-rarity.js', 'blueprint-visual.js', 'capture-regions.js', 'community-share.js', 'full-map-match.js', 'icon-match.js', 'location-pending.js', 'logic.js', 'loot-window.js', 'map-detect.js', 'map-match.js', 'map-presets.js', 'ocr-crop.js', 'recent-finds.js', 'sighting-feedback.js', 'spider-layout.js', 'style.css', 'tile-feedback.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "public/$name") -Destination $publicRoot
}
foreach ($directory in @('catalog-icons', 'icon-references', 'maps', 'vendor')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "public/$directory") -Destination $publicRoot -Recurse
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'test') -Destination $sourceRoot -Recurse
$feedbackFixtureRoot = Join-Path $sourceRoot 'research/fixtures/feedback-2026-10-01'
New-Item -ItemType Directory -Path $feedbackFixtureRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'research/fixtures/feedback-2026-10-01/tile-pixels.json.gz') -Destination $feedbackFixtureRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/Start Blueprint Map.cmd') -Destination $sourceRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/Start-Blueprint-Map.ps1') -Destination $sourceRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/README.md') -Destination (Join-Path $sourceRoot 'README.md')
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/THIRD-PARTY.md') -Destination $sourceRoot
Copy-Item -LiteralPath (Join-Path $projectRoot '.gitignore') -Destination $sourceRoot
$scriptsRoot = Join-Path $sourceRoot 'scripts'
$workflowRoot = Join-Path $sourceRoot '.github/workflows'
New-Item -ItemType Directory -Path $scriptsRoot, $workflowRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/Build-Portable.ps1') -Destination $scriptsRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'distribution/release.yml') -Destination $workflowRoot

$app = Get-Content -LiteralPath (Join-Path $projectRoot 'public/app.js') -Raw
$app = Replace-ExactlyOnce $app '(?m), screenshotFinds: \$\(''add-screenshot-finds''\)' ''
$app = Replace-ExactlyOnce $app 'const suppliedFinds = \[.*?\];\r?\n' ''
$app = Replace-ExactlyOnce $app 'ui\.screenshotFinds\.addEventListener\(''click'', \(\) => \{.*?\}\);\s*(?=ui\.map\.addEventListener)' ''
Set-Content -LiteralPath (Join-Path $publicRoot 'app.js') -Value $app -Encoding utf8NoBOM

$index = Get-Content -LiteralPath (Join-Path $projectRoot 'public/index.html') -Raw
$index = Replace-ExactlyOnce $index '(?m)^\s*<button id="add-screenshot-finds".*?\r?\n\s*<p class="hint">These use your player position.*?\r?\n\s*<p class="hint"><a href="/collection.html".*?\r?\n' "`r`n"
Set-Content -LiteralPath (Join-Path $publicRoot 'index.html') -Value $index -Encoding utf8NoBOM

$catalog = Get-Content -LiteralPath (Join-Path $projectRoot 'public/collection-data.json') -Raw | ConvertFrom-Json
$publicCatalog = @($catalog | ForEach-Object { [pscustomobject]@{ slot = $_.slot; row = $_.row; column = $_.column; name = $_.name; icon = $_.icon } })
$publicCatalog | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $publicRoot 'collection-data.json') -Encoding utf8NoBOM

Write-Output "Shareable source: $sourceRoot"
if ($Portable) {
    & (Join-Path $scriptsRoot 'Build-Portable.ps1') -OutputDirectory (Join-Path $sourceRoot 'dist')
}
