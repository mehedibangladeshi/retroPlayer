export type PowerKeyAction = 'volumeUp' | 'volumeDown' | 'loop' | 'shuffle' | 'stop' | 'visualizer'

const BY_KEY: Record<string, PowerKeyAction> = { l: 'loop', v: 'visualizer' }

/** Maps a key press to a power-deck action. Modified keys are never ours (except Shift+S = shuffle); only volume auto-repeats. */
export function powerKeyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean }): PowerKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key === 'ArrowUp') return 'volumeUp'
  if (e.key === 'ArrowDown') return 'volumeDown'
  if (e.repeat) return null
  const k = e.key.toLowerCase()
  if (k === 's') return e.shiftKey ? 'shuffle' : 'stop'
  return e.shiftKey ? null : (BY_KEY[k] ?? null)
}
