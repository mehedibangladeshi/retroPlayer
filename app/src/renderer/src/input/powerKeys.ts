export type PowerKeyAction = 'volumeUp' | 'volumeDown' | 'loop' | 'shuffle' | 'visualizer'

const BY_KEY: Record<string, PowerKeyAction> = { l: 'loop', s: 'shuffle', v: 'visualizer' }

/** Maps a key press to a power-deck action. Modified keys are never ours; only volume auto-repeats. */
export function powerKeyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): PowerKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key === 'ArrowUp') return 'volumeUp'
  if (e.key === 'ArrowDown') return 'volumeDown'
  return e.repeat ? null : (BY_KEY[e.key.toLowerCase()] ?? null)
}
