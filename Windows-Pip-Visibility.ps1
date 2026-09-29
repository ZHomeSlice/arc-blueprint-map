param(
    [ValidateSet('Show', 'Hide', 'Status')][string]$Action,
    [int]$Left,
    [int]$Top,
    [int]$Width,
    [int]$Height,
    [int]$ViewportHeight,
    [int]$TargetViewportHeight
)

$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BlueprintPipWindow {
    public delegate bool EnumProc(IntPtr handle, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, StringBuilder text, int max);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr handle, int index);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr handle, IntPtr after,
        int x, int y, int width, int height, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
}
'@

$script:targets = New-Object System.Collections.Generic.List[System.IntPtr]
$callback = [BlueprintPipWindow+EnumProc]{
    param($handle, $parameter)
    $title = New-Object System.Text.StringBuilder 260
    [void][BlueprintPipWindow]::GetWindowText($handle, $title, $title.Capacity)
    if ($title.ToString() -notmatch 'ARC Blueprint Map|ARC Blueprint Alert|127\.0\.0\.1:4177') { return $true }
    $class = New-Object System.Text.StringBuilder 260
    [void][BlueprintPipWindow]::GetClassName($handle, $class, $class.Capacity)
    if ($class.ToString() -ne 'Chrome_WidgetWin_1') { return $true }
    [uint32]$processId = 0
    [void][BlueprintPipWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
    try { $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName }
    catch { return $true }
    if ($processName -notin @('chrome', 'msedge', 'msedgewebview2', 'codex')) { return $true }
    $rect = New-Object BlueprintPipWindow+Rect
    if (-not [BlueprintPipWindow]::GetWindowRect($handle, [ref]$rect)) { return $true }
    if ([Math]::Abs($rect.Left - $Left) -gt 35 -or [Math]::Abs($rect.Top - $Top) -gt 35 -or
        [Math]::Abs(($rect.Right - $rect.Left) - $Width) -gt 35 -or
        [Math]::Abs(($rect.Bottom - $rect.Top) - $Height) -gt 35) { return $true }
    $script:targets.Add($handle)
    return $true
}
$attempt = 0
while ($script:targets.Count -eq 0 -and $attempt -lt 5) {
    [void][BlueprintPipWindow]::EnumWindows($callback, [IntPtr]::Zero)
    $attempt++
    if ($script:targets.Count -eq 0) { Start-Sleep -Milliseconds 150 }
}
if ($script:targets.Count -ne 1) { throw "Expected one matching Picture-in-Picture window, found $($script:targets.Count)" }
$target = $script:targets[0]

if ($Action -eq 'Status') {
    Write-Output ([BlueprintPipWindow]::IsWindowVisible($target))
    exit 0
}

$rect = New-Object BlueprintPipWindow+Rect
[void][BlueprintPipWindow]::GetWindowRect($target, [ref]$rect)
$targetHeight = $rect.Bottom - $rect.Top
if ($ViewportHeight -gt 0 -and $TargetViewportHeight -gt 0) {
    $targetHeight += $TargetViewportHeight - $ViewportHeight
    if ($targetHeight -lt 90 -or $targetHeight -gt 950) { throw 'Invalid resized Picture-in-Picture height' }
}
$targetTop = $rect.Bottom - $targetHeight
if ($Action -eq 'Hide') {
    [void][BlueprintPipWindow]::ShowWindowAsync($target, 0)
    [void][BlueprintPipWindow]::SetWindowPos($target, [IntPtr](-1), $rect.Left, $targetTop,
        ($rect.Right - $rect.Left), $targetHeight, 0x0010)
} else {
    # Grow upward and restore the browser window without taking game focus.
    [void][BlueprintPipWindow]::SetWindowPos($target, [IntPtr](-1), $rect.Left, $targetTop,
        ($rect.Right - $rect.Left), $targetHeight, 0x0010)
    [void][BlueprintPipWindow]::ShowWindowAsync($target, 8)
}
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    if ([BlueprintPipWindow]::IsWindowVisible($target) -eq ($Action -eq 'Show')) { break }
    Start-Sleep -Milliseconds 100
}
if ([BlueprintPipWindow]::IsWindowVisible($target) -ne ($Action -eq 'Show')) {
    throw "Could not $Action browser Picture-in-Picture window"
}
Write-Output "$Action browser Picture-in-Picture window"
