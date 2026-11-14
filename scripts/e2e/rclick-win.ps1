# Real right-click on Windows, then Escape to close any menu: powershell -File rclick-win.ps1 x y (physical pixels)
param([int]$x, [int]$y)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 100
[M]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 1000
[M]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero); [M]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero)
