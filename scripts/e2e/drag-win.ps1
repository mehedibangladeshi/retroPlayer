# Real pointer drag on Windows: powershell -File drag-win.ps1 x0 y0 dx dy steps (physical pixels)
param([int]$x0, [int]$y0, [int]$dx, [int]$dy, [int]$steps)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
}
"@
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos($x0, $y0) | Out-Null; Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 150
for ($i = 1; $i -le $steps; $i++) {
  [M]::SetCursorPos($x0 + [int]($dx * $i / $steps), $y0 + [int]($dy * $i / $steps)) | Out-Null
  Start-Sleep -Milliseconds 30
}
Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
