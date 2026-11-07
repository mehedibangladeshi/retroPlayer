// OS window stacking and taskbar entries for the E2E. Window ids are the number in Electron's getMediaSourceId()
// ("window:<id>:0"): an X11 window id on Linux, an HWND on Windows, a CGWindowID on macOS.
import { execFileSync } from 'node:child_process'

/** The given window ids, topmost first, as the OS stacks them (only those it reports). */
export function stackTopFirst(ids) {
  let all
  if (process.platform === 'linux') {
    // bottom to top
    const out = execFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING']).toString()
    all = (out.match(/0x[0-9a-f]+/gi) ?? []).map((h) => parseInt(h, 16)).reverse()
  } else if (process.platform === 'win32') {
    const ps = `Add-Type 'using System; using System.Runtime.InteropServices; public class Z {
      [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
      [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c); }'
      $h = [Z]::GetTopWindow([IntPtr]::Zero); while ($h -ne [IntPtr]::Zero) { $h.ToInt64(); $h = [Z]::GetWindow($h, 2) }`
    all = execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().split(/\r?\n/).filter(Boolean).map(Number)
  } else {
    const swift = `import CoreGraphics
      let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
      for w in l { print(w[kCGWindowNumber as String] as! Int) }`
    all = execFileSync('swift', ['-'], { input: swift }).toString().split(/\n/).filter(Boolean).map(Number)
  }
  return all.filter((id) => ids.includes(id))
}

/** How many taskbar/Dock entries the given windows of one app (process `pid`) get.
 *  Linux: taskbars skip a window flagged _NET_WM_STATE_SKIP_TASKBAR and fold a transient (WM_TRANSIENT_FOR) window into
 *  its main window. Windows: the shell gives a button to a visible window that has no owner and is not a tool window,
 *  or to one with WS_EX_APPWINDOW. macOS: the Dock shows one icon per regular app process, whatever its windows. */
export function taskbarEntries(ids, pid) {
  if (process.platform === 'linux') {
    return ids.filter((id) => {
      const p = execFileSync('xprop', ['-id', String(id), '_NET_WM_STATE', 'WM_TRANSIENT_FOR']).toString()
      return !p.includes('SKIP_TASKBAR') && !/WM_TRANSIENT_FOR\(WINDOW\): window id # 0x/.test(p)
    }).length
  }
  if (process.platform === 'win32') {
    const ps = `Add-Type 'using System; using System.Runtime.InteropServices; public class T {
      [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
      [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
      [DllImport("user32.dll")] public static extern long GetWindowLongPtr(IntPtr h, int i); }'
      foreach ($id in @(${ids.join(',')})) { $h = [IntPtr]$id; $ex = [T]::GetWindowLongPtr($h, -20)
        $owned = [T]::GetWindow($h, 4) -ne [IntPtr]::Zero
        $button = [T]::IsWindowVisible($h) -and ((($ex -band 0x40000) -ne 0) -or (-not $owned -and ($ex -band 0x80) -eq 0))
        "$id owned=$owned exstyle=$ex button=$button" }`
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString()
    console.log(out.trim())
    return (out.match(/button=True/g) ?? []).length
  }
  // NSApplicationActivationPolicy: 0 = regular (has a Dock icon).
  const swift = `import AppKit
    for a in NSWorkspace.shared.runningApplications where a.activationPolicy == .regular { print(a.processIdentifier) }`
  const regular = execFileSync('swift', ['-'], { input: swift }).toString().split(/\n/).filter(Boolean).map(Number)
  // The app's own process and any helper it spawned (helpers are not regular apps, so they never count).
  const tree = execFileSync('ps', ['-axo', 'pid=,ppid=']).toString().trim().split(/\n/).map((l) => l.trim().split(/\s+/).map(Number))
  const mine = new Set([pid])
  for (let grew = true; grew; ) {
    grew = false
    for (const [p, pp] of tree) if (mine.has(pp) && !mine.has(p)) (mine.add(p), (grew = true))
  }
  return regular.filter((p) => mine.has(p)).length
}
