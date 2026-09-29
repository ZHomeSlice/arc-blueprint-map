$ErrorActionPreference = 'Stop'
$port = 4177
if ($env:ARC_BLUEPRINT_PORT -match '^\d+$' -and [int]$env:ARC_BLUEPRINT_PORT -ge 1 -and [int]$env:ARC_BLUEPRINT_PORT -le 65535) {
    $port = [int]$env:ARC_BLUEPRINT_PORT
}
$url = "http://127.0.0.1:$port/"

function Test-Tracker {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('<title>ARC Blueprint Map</title>')
    } catch {
        return $false
    }
}

try {
    if (-not (Test-Tracker)) {
        $portableNode = Join-Path $PSScriptRoot 'runtime\node.exe'
        if (Test-Path -LiteralPath $portableNode) {
            $node = $portableNode
        } else {
            $command = Get-Command node.exe -ErrorAction SilentlyContinue
            if (-not $command) {
                throw 'Node.js was not found. Download the portable ZIP from GitHub Releases, or install Node.js 20 or newer.'
            }
            $node = $command.Source
        }

        $versionText = & $node --version
        if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.') {
            throw 'Node.js could not be started.'
        }
        if ([int]$Matches[1] -lt 20) {
            throw "Node.js $versionText is too old. Use the portable ZIP or install Node.js 20 or newer."
        }

        $env:PORT = [string]$port
        $process = Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            if (Test-Tracker) { $ready = $true; break }
            if ($process.HasExited) { break }
        }
        if (-not $ready) {
            throw "The tracker could not start on port $port. Close any app using that port and try again."
        }
    }
    Start-Process $url
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
