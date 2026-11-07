// Native Wayland does not let an app read or set its window positions, so docking cannot work there. Chromium picks
// its platform before main.js runs (app.commandLine.appendSwitch is too late), so on a Wayland session with an X
// server (XWayland) we relaunch once with --ozone-platform=x11. Pure: no Electron imports.

type Env = Record<string, string | undefined>

/** How to relaunch on X11, or null when not needed (not Linux, already X11, no XWayland, platform chosen). */
export function x11Relaunch(platform: string, env: Env, argv: string[], execPath: string): { execPath: string; args: string[] } | null {
  if (platform !== 'linux' || !env.WAYLAND_DISPLAY || !env.DISPLAY) return null
  if (argv.some((a) => a.startsWith('--ozone-platform'))) return null
  // An AppImage runs from a mount that disappears when this process exits: relaunch the AppImage file itself.
  return { execPath: env.APPIMAGE || execPath, args: [...argv.slice(1), '--ozone-platform=x11'] }
}
