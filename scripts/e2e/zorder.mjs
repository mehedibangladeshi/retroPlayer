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

/** Linux only: how many of the given windows get their own taskbar entry. Taskbars skip a window flagged
 *  _NET_WM_STATE_SKIP_TASKBAR, and fold a transient window (WM_TRANSIENT_FOR) into its main window. */
export function taskbarEntries(ids) {
  return ids.filter((id) => {
    const p = execFileSync('xprop', ['-id', String(id), '_NET_WM_STATE', 'WM_TRANSIENT_FOR']).toString()
    return !p.includes('SKIP_TASKBAR') && !/WM_TRANSIENT_FOR\(WINDOW\): window id # 0x/.test(p)
  }).length
}
