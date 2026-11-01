import type { Album, ErrorCode, EngineEvent, Status, TrackInfo } from '@shared/protocol'

export interface EngineState {
  status: Status
  positionMs: number
  durationMs: number | null
  trackInfo: TrackInfo | null
  error: { code: ErrorCode; message: string } | null
  album: Album | null
  artwork: string | null
  /** performance.now() when positionMs was last set by the engine. */
  lastPositionAt: number
}

const ERROR_TTL_MS = 8000

let state: EngineState = {
  status: 'empty',
  positionMs: 0,
  durationMs: null,
  trackInfo: null,
  error: null,
  album: null,
  artwork: null,
  lastPositionAt: 0
}
const listeners = new Set<() => void>()
let pendingAutoPlay: string | null = null
let errorTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribeEngine: (() => void) | null = null

function set(patch: Partial<EngineState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getSnapshot = (): EngineState => state

export function setError(code: ErrorCode, message: string): void {
  clearTimeout(errorTimer)
  errorTimer = setTimeout(clearError, ERROR_TTL_MS)
  set({ error: { code, message } })
}
export function clearError(): void {
  clearTimeout(errorTimer)
  if (state.error) set({ error: null })
}

/** Arms the automatic `play` that follows a `load` of `path`. */
export function expectAutoPlay(path: string): void {
  pendingAutoPlay = path
}

function handle(e: EngineEvent): void {
  switch (e.type) {
    case 'state': {
      const newTrack = e.trackInfo !== null && e.trackInfo.path !== state.trackInfo?.path
      const matchesPending = e.trackInfo !== null && e.trackInfo.path === pendingAutoPlay
      if (newTrack || matchesPending) clearError()
      if (matchesPending && e.status === 'stopped') {
        pendingAutoPlay = null
        window.retro.send({ v: 1, type: 'play' })
      }
      set({
        status: e.status,
        positionMs: e.positionMs,
        durationMs: e.durationMs,
        trackInfo: e.trackInfo,
        lastPositionAt: performance.now()
      })
      break
    }
    case 'position':
      set({ positionMs: e.positionMs, lastPositionAt: performance.now() })
      break
    case 'ended':
      break
    case 'playlist':
      set({ album: e.album })
      break
    case 'artwork':
      set({ artwork: e.cover })
      break
    case 'error':
      pendingAutoPlay = null
      setError(e.code, e.message)
      break
  }
}

/** Idempotent: safe under StrictMode double-mount and HMR. */
export function start(): void {
  if (unsubscribeEngine) return
  if (!window.retro) {
    setError('internal', 'Preload API unavailable')
    return
  }
  unsubscribeEngine = window.retro.onEvent(handle)
}

// Note: an HMR re-eval of this module resets the store to empty; acceptable in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEngine?.()
    unsubscribeEngine = null
  })
}
