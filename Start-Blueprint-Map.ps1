$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:4177/'

try {
    $response = Invoke-WebRequest -Uri $url -TimeoutSec 2
    $running = $response.StatusCode -eq 200
} catch {
    $running = $false
}

if (-not $running) {
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $node) {
        $node = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
    if (-not (Test-Path -LiteralPath $node)) {
        throw 'Node.js was not found. Install Node.js 20 or newer, then run this script again.'
    }
    Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 150
        try {
            $response = Invoke-WebRequest -Uri $url -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $running = $true; break }
        } catch { }
    }
    if (-not $running) { throw 'The local app did not start. Run node server.mjs to see the error.' }
}

$companion = Join-Path $PSScriptRoot 'Windows-Pip-Companion.ps1'
Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$companion`" -Port 4177" `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
Start-Process $url
