import { PROTOCOL_VERSION, SUPPORTED_EXTENSIONS, type EngineEvent } from '@shared/protocol'
import { SOUNDS } from '@shared/sounds'

const EVENT_TYPES = new Set(['state', 'position', 'ended', 'error'])

/** Splits a byte/text stream into lines, buffering partial chunks. Empty lines are ignored. */
export class LineSplitter {
  private buf = ''
  push(chunk: string): string[] {
    this.buf += chunk
    const parts = this.buf.split('\n')
    this.buf = parts.pop() ?? ''
    return parts.map((l) => l.trim()).filter((l) => l.length > 0)
  }
}

/** Parses one NDJSON line into an engine event; returns null (after logging) if malformed. */
export function parseEvent(line: string): EngineEvent | null {
  try {
    const obj: unknown = JSON.parse(line)
    if (typeof obj === 'object' && obj !== null) {
      const o = obj as { v?: unknown; type?: unknown }
      if (o.v === PROTOCOL_VERSION && typeof o.type === 'string' && EVENT_TYPES.has(o.type)) {
        return obj as EngineEvent
      }
    }
    console.error('[engine] dropped message with missing/invalid v or type:', line)
  } catch {
    console.error('[engine] dropped non-JSON line:', line)
  }
  return null
}

// Commands the renderer may send. `loadSound` is main-process only, so it is not listed.
const COMMAND_TYPES = new Set(['load', 'play', 'pause', 'stop', 'seek', 'seekRelative', 'playSound'])

/** True if the path ends in a supported audio extension (case-insensitive). */
function hasSupportedExtension(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(path.slice(dot + 1).toLowerCase())
}

/** Light validation of a renderer-supplied command. */
export function isValidCommand(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false
  const c = x as Record<string, unknown>
  if (c.v !== PROTOCOL_VERSION || typeof c.type !== 'string' || !COMMAND_TYPES.has(c.type)) return false
  if (c.type === 'load') return typeof c.path === 'string' && hasSupportedExtension(c.path)
  if (c.type === 'seek') return typeof c.positionMs === 'number' && Number.isFinite(c.positionMs)
  if (c.type === 'seekRelative') return typeof c.deltaMs === 'number' && Number.isFinite(c.deltaMs)
  if (c.type === 'playSound') return typeof c.name === 'string' && Object.hasOwn(SOUNDS, c.name)
  return true
}
