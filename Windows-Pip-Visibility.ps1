param(
    [ValidateSet('Show', 'Hide', 'Status')][string]$Action,
    [int]$Left,
    [int]$Top,
    [int]$Width,
    [int]$Height
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

$script:target = [IntPtr]::Zero
$callback = [BlueprintPipWindow+EnumProc]{
    param($handle, $parameter)
    $title = New-Object System.Text.StringBuilder 260
    [void][BlueprintPipWindow]::GetWindowText($handle, $title, $title.Capacity)
    if ($title.ToString() -notin @('ARC Blueprint Map', 'ARC Blueprint Alert')) { return $true }
    $class = New-Object System.Text.StringBuilder 260
    [void][BlueprintPipWindow]::GetClassName($handle, $class, $class.Capacity)
    if ($class.ToString() -ne 'Chrome_WidgetWin_1') { return $true }
    [uint32]$processId = 0
    [void][BlueprintPipWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
    try { $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName }
    catch { return $true }
    if ($processName -notin @('chrome', 'msedge')) { return $true }
    $rect = New-Object BlueprintPipWindow+Rect
    if (-not [BlueprintPipWindow]::GetWindowRect($handle, [ref]$rect)) { return $true }
    if ([Math]::Abs($rect.Left - $Left) -gt 35 -or [Math]::Abs($rect.Top - $Top) -gt 35 -or
        [Math]::Abs(($rect.Right - $rect.Left) - $Width) -gt 35 -or
        [Math]::Abs(($rect.Bottom - $rect.Top) - $Height) -gt 35) { return $true }
    if (([BlueprintPipWindow]::GetWindowLong($handle, -20) -band 0x8) -eq 0) { return $true }
    $script:target = $handle
    return $false
}
$attempt = 0
while ($script:target -eq [IntPtr]::Zero -and $attempt -lt 5) {
    [void][BlueprintPipWindow]::EnumWindows($callback, [IntPtr]::Zero)
    $attempt++
    if ($script:target -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 150 }
}
if ($script:target -eq [IntPtr]::Zero) { throw 'Matching browser Picture-in-Picture window not found' }

if ($Action -eq 'Status') {
    Write-Output ([BlueprintPipWindow]::IsWindowVisible($script:target))
    exit 0
}

if ($Action -eq 'Hide') {
    [void][BlueprintPipWindow]::ShowWindowAsync($script:target, 0)
} else {
    [void][BlueprintPipWindow]::ShowWindowAsync($script:target, 8)
    # Restore the existing browser window above the game without taking keyboard focus.
    [void][BlueprintPipWindow]::SetWindowPos($script:target, [IntPtr](-1), 0, 0, 0, 0, 0x0013)
}
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    if ([BlueprintPipWindow]::IsWindowVisible($script:target) -eq ($Action -eq 'Show')) { break }
    Start-Sleep -Milliseconds 100
}
if ([BlueprintPipWindow]::IsWindowVisible($script:target) -ne ($Action -eq 'Show')) {
    throw "Could not $Action browser Picture-in-Picture window"
}
Write-Output "$Action browser Picture-in-Picture window"
