param(
    [int]$Port = 4177,
    [switch]$Validate,
    [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if ($Validate) { Write-Output 'Windows Forms available'; exit 0 }

[System.Windows.Forms.Application]::EnableVisualStyles()
$script:form = New-Object System.Windows.Forms.Form
$script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$script:form.ShowInTaskbar = $false
$script:form.TopMost = $true
$script:form.Width = 390
$script:form.Height = 54
$script:form.BackColor = [System.Drawing.Color]::FromArgb(28, 43, 38)
$script:form.ForeColor = [System.Drawing.Color]::FromArgb(245, 242, 233)
$script:form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$working = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$script:form.Location = New-Object System.Drawing.Point(($working.Right - 410), ($working.Bottom - 74))

$bar = New-Object System.Windows.Forms.Panel
$bar.Dock = [System.Windows.Forms.DockStyle]::Bottom
$bar.Height = 54
$bar.BackColor = [System.Drawing.Color]::FromArgb(36, 58, 46)
$script:form.Controls.Add($bar)

$dot = New-Object System.Windows.Forms.Label
$dot.Text = [char]0x25CF
$dot.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$dot.ForeColor = [System.Drawing.Color]::FromArgb(133, 217, 154)
$dot.Location = New-Object System.Drawing.Point(12, 14)
$dot.Size = New-Object System.Drawing.Size(22, 28)
$bar.Controls.Add($dot)

$barText = New-Object System.Windows.Forms.Label
$barText.Text = 'SCANNING FOR BLUEPRINTS'
$barText.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$barText.ForeColor = [System.Drawing.Color]::FromArgb(201, 236, 208)
$barText.Location = New-Object System.Drawing.Point(36, 17)
$barText.Size = New-Object System.Drawing.Size(305, 24)
$bar.Controls.Add($barText)

$close = New-Object System.Windows.Forms.Button
$close.Text = [char]0x00D7
$close.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$close.FlatAppearance.BorderSize = 0
$close.BackColor = $bar.BackColor
$close.ForeColor = [System.Drawing.Color]::White
$close.Font = New-Object System.Drawing.Font('Segoe UI', 13)
$close.Location = New-Object System.Drawing.Point(350, 8)
$close.Size = New-Object System.Drawing.Size(32, 36)
$close.Add_Click({ $script:form.Close() })
$bar.Controls.Add($close)

$details = New-Object System.Windows.Forms.Panel
$details.Dock = [System.Windows.Forms.DockStyle]::Fill
$details.Padding = New-Object System.Windows.Forms.Padding(14)
$details.Visible = $false
$script:form.Controls.Add($details)
$details.BringToFront()

$name = New-Object System.Windows.Forms.Label
$name.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$name.Location = New-Object System.Drawing.Point(14, 12)
$name.Size = New-Object System.Drawing.Size(360, 32)
$details.Controls.Add($name)

$blueprint = New-Object System.Windows.Forms.PictureBox
$blueprint.Location = New-Object System.Drawing.Point(14, 50)
$blueprint.Size = New-Object System.Drawing.Size(88, 88)
$blueprint.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$blueprint.BackColor = [System.Drawing.Color]::FromArgb(10, 27, 48)
$details.Controls.Add($blueprint)

$message = New-Object System.Windows.Forms.Label
$message.Location = New-Object System.Drawing.Point(114, 54)
$message.Size = New-Object System.Drawing.Size(260, 74)
$message.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$details.Controls.Add($message)

$detail = New-Object System.Windows.Forms.Label
$detail.Location = New-Object System.Drawing.Point(14, 150)
$detail.Size = New-Object System.Drawing.Size(360, 38)
$detail.ForeColor = [System.Drawing.Color]::FromArgb(183, 200, 192)
$details.Controls.Add($detail)

$map = New-Object System.Windows.Forms.PictureBox
$map.Location = New-Object System.Drawing.Point(14, 194)
$map.Size = New-Object System.Drawing.Size(360, 70)
$map.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$map.Visible = $false
$details.Controls.Add($map)

function Set-OverlayImage([System.Windows.Forms.PictureBox]$target, [string]$source) {
    $previous = $target.Image
    $target.Image = $null
    if ($previous) { $previous.Dispose() }
    if (-not $source -or -not $source.StartsWith('data:image/')) { return }
    try {
        $bytes = [Convert]::FromBase64String($source.Substring($source.IndexOf(',') + 1))
        $stream = New-Object System.IO.MemoryStream(,$bytes)
        try {
            $loaded = [System.Drawing.Image]::FromStream($stream)
            try { $target.Image = New-Object System.Drawing.Bitmap($loaded) }
            finally { $loaded.Dispose() }
        } finally { $stream.Dispose() }
    } catch { $target.Image = $null }
}

function Set-OverlayHeight([int]$height) {
    if ($script:form.Height -eq $height) { return }
    $bottom = $script:form.Bottom
    $script:form.Height = $height
    $script:form.Top = $bottom - $height
}

if ($SmokeTest) {
    $bottom = $script:form.Bottom
    Set-OverlayHeight 330
    $script:form.PerformLayout()
    if ($script:form.Bottom -ne $bottom -or $script:form.Height -ne 330) { throw 'Expansion moved the bar' }
    if ($details.Bottom -gt $bar.Top) { throw 'Expanded details cover the bottom bar' }
    Set-OverlayHeight 54
    if ($script:form.Bottom -ne $bottom -or $script:form.Height -ne 54) { throw 'Collapse moved the bar' }
    Write-Output 'Overlay grows upward and returns to a 54px bar'
    exit 0
}

$script:dragging = $false
$startDrag = {
    param($sender, $eventArgs)
    if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    $script:dragging = $true
    $script:dragCursor = [System.Windows.Forms.Cursor]::Position
    $script:dragOrigin = $script:form.Location
}
$moveDrag = {
    if (-not $script:dragging) { return }
    $current = [System.Windows.Forms.Cursor]::Position
    $script:form.Location = New-Object System.Drawing.Point(
        ($script:dragOrigin.X + $current.X - $script:dragCursor.X),
        ($script:dragOrigin.Y + $current.Y - $script:dragCursor.Y))
}
$stopDrag = { $script:dragging = $false }
foreach ($control in @($bar, $barText, $dot)) {
    $control.Add_MouseDown($startDrag)
    $control.Add_MouseMove($moveDrag)
    $control.Add_MouseUp($stopDrag)
}

$script:lastRevision = -1
$script:failures = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
    try {
        $state = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/overlay/state" -TimeoutSec 1
        $script:failures = 0
        if ($state.revision -le $script:lastRevision) { return }
        $script:lastRevision = $state.revision
        $barText.Text = [string]$state.bar
        $expanded = [bool]$state.expanded
        $details.Visible = $expanded
        Set-OverlayHeight $(if ($expanded) { 330 } else { 54 })
        if ($expanded) {
            $name.Text = [string]$state.name
            $message.Text = [string]$state.message
            $detail.Text = [string]$state.detail
            Set-OverlayImage $blueprint ([string]$state.image)
            Set-OverlayImage $map ([string]$state.mapImage)
            $map.Visible = [bool]$state.mapImage
        } else {
            Set-OverlayImage $blueprint ''
            Set-OverlayImage $map ''
            $map.Visible = $false
        }
    } catch {
        $script:failures++
        if ($script:failures -ge 8) { $script:form.Close() }
    }
})
$script:form.Add_Shown({ $timer.Start() })
$script:form.Add_FormClosed({ $timer.Stop(); $timer.Dispose() })
[System.Windows.Forms.Application]::Run($script:form)
