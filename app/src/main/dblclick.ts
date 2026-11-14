import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const DOUBLE_CLICK_FALLBACK_MS = 500

type Kind = 'reg' | 'defaults' | 'kde' | 'gsettings'

const PATTERNS: Record<Kind, RegExp> = {
  reg: /DoubleClickSpeed\s+REG_SZ\s+(\d+)/,
  defaults: /^\s*(\d*\.?\d+)\s*$/, // seconds
  kde: /^\s*(\d+)\s*$/,
  gsettings: /^\s*(?:uint32\s+)?(\d+)\s*$/,
}

/** The OS double-click time in ms from one command's stdout, clamped to [150, 1000]; null if absent or unparsable. */
export function parseDoubleClickMs(kind: Kind, stdout: string): number | null {
  const m = PATTERNS[kind].exec(stdout)
  if (!m) return null
  const ms = Math.round(Number(m[1]) * (kind === 'defaults' ? 1000 : 1))
  return ms > 0 ? Math.min(1000, Math.max(150, ms)) : null
}

const run = promisify(execFile)

async function tryRead(kind: Kind, file: string, args: string[]): Promise<number | null> {
  try {
    const { stdout } = await run(file, args, { timeout: 2000, windowsHide: true })
    return parseDoubleClickMs(kind, stdout)
  } catch {
    return null // command missing or key unset
  }
}

/** Reads the OS double-click time once (Chromium uses it for MouseEvent.detail), else 500 ms. */
export async function readDoubleClickMs(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const tries: [Kind, string, string[]][] = []
  if (platform === 'win32') tries.push(['reg', 'reg', ['query', 'HKCU\\Control Panel\\Mouse', '/v', 'DoubleClickSpeed']])
  if (platform === 'darwin') tries.push(['defaults', 'defaults', ['read', '-g', 'com.apple.mouse.doubleClickThreshold']])
  if (platform === 'linux') {
    if (env.XDG_CURRENT_DESKTOP?.includes('KDE')) {
      for (const bin of ['kreadconfig6', 'kreadconfig5']) tries.push(['kde', bin, ['--group', 'KDE', '--key', 'DoubleClickInterval']])
    }
    tries.push(['gsettings', 'gsettings', ['get', 'org.gnome.desktop.peripherals.mouse', 'double-click']])
  }
  for (const [kind, file, args] of tries) {
    const ms = await tryRead(kind, file, args)
    if (ms !== null) return ms
  }
  return DOUBLE_CLICK_FALLBACK_MS
}
