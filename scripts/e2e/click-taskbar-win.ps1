# A real mouse click on an app's taskbar button: powershell -File click-taskbar-win.ps1 <name regex>
# Lists the taskbar buttons (UI Automation), clicks the first whose name matches. Exit 2 when none matches.
param([string]$match)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
}
"@
[M]::SetProcessDPIAware() | Out-Null # physical pixels for UI Automation rects and the cursor alike
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$tray = $AE::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,
  (New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'Shell_TrayWnd')))
$buttons = $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants,
  (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
$hits = @($buttons | Where-Object { $_.Current.Name -match $match })
foreach ($b in $buttons) { "button: $($b.Current.Name)" }
"matches: $($hits.Count)"
if ($hits.Count -eq 0) { exit 2 }
$r = $hits[0].Current.BoundingRectangle
[M]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)) | Out-Null; Start-Sleep -Milliseconds 200
[M]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80
[M]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
