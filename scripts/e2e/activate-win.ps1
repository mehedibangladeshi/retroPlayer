# Activate a window the way a taskbar click does (switches to it even from the background): activate-win.ps1 hwnd
param([long]$hwnd)
Add-Type 'using System; using System.Runtime.InteropServices; public class A {
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool altTab); }'
[A]::SwitchToThisWindow([IntPtr]$hwnd, $true)
