param([int]$Port = 4177)

$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ArcBlueprintPipCompanion')
$ownsMutex = $false
try { $ownsMutex = $mutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
if (-not $ownsMutex) { $mutex.Dispose(); exit 0 }
try {
    $baseUrl = "http://127.0.0.1:$Port/api/overlay"
    $headers = @{ Origin = "http://127.0.0.1:$Port" }
    $lastRevision = 0
    $lastHeartbeat = [DateTime]::MinValue
    while ($true) {
        try {
            if ((Get-Date) - $lastHeartbeat -ge [TimeSpan]::FromSeconds(1)) {
                Invoke-RestMethod -Uri "$baseUrl/pip-heartbeat" -Method Post -Headers $headers `
                    -ContentType 'application/json' -Body '{}' -TimeoutSec 2 | Out-Null
                $lastHeartbeat = Get-Date
            }
            $command = Invoke-RestMethod -Uri "$baseUrl/pip-command" -TimeoutSec 2
            if ($command.revision -lt $lastRevision) { $lastRevision = 0 }
            if ($command.revision -gt $lastRevision) {
                $lastRevision = [int]$command.revision
                $success = $true
                $errorText = ''
                try {
                    & (Join-Path $PSScriptRoot 'Windows-Pip-Visibility.ps1') `
                        -Action $(if ($command.visible) { 'Show' } else { 'Hide' }) `
                        -Left $command.left -Top $command.top -Width $command.width -Height $command.height `
                        -ViewportHeight $command.viewportHeight -TargetViewportHeight $command.targetViewportHeight | Out-Null
                } catch {
                    $success = $false
                    $errorText = $_.Exception.Message
                }
                $report = @{ revision = $lastRevision; success = $success; error = $errorText } | ConvertTo-Json -Compress
                Invoke-RestMethod -Uri "$baseUrl/pip-report" -Method Post -Headers $headers `
                    -ContentType 'application/json' -Body $report -TimeoutSec 2 | Out-Null
            }
        } catch {
            # The local server may be restarting. Keep the desktop helper ready.
        }
        Start-Sleep -Milliseconds 250
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
