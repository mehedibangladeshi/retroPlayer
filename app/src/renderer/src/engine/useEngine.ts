import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { extrapolate, noBackslide } from './smoothPosition'
import { getSnapshot, subscribe, type EngineState } from './store'

export function useEngine(): EngineState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * One rAF loop for as long as the status is `playing` (not restarted per `position` event: it reads the
 * latest store values each frame). `shape` turns the extrapolated ms into the shown value; setState bails
 * out on an equal value, so a coarse `shape` re-renders rarely.
 */
function useFramePosition(shape: (ms: number, prevShown: number) => number): number {
  const { status, positionMs } = useEngine()
  const [shown, setShown] = useState(0)
  const playing = status === 'playing'

  useLayoutEffect(() => {
    if (!playing) return
    let raf = 0
    let prev = -Infinity
    const frame = (): void => {
      const s = getSnapshot()
      prev = shape(extrapolate(s.positionMs, s.lastPositionAt, performance.now(), s.durationMs, true), prev)
      setShown(prev)
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [playing, shape])

  return playing ? shown : positionMs
}

const wholeSecond = (ms: number): number => Math.floor(ms / 1000) * 1000
const noBack = (ms: number, prev: number): number => noBackslide(prev, ms)

/** For the mm:ss timer: whole seconds, so the player re-renders once a second, not every frame. */
export function useDisplayPosition(): number {
  return useFramePosition(wholeSecond)
}

/** For the seek bar: unfloored, moves every frame, never steps back on event jitter. */
export function useSmoothPosition(): number {
  return useFramePosition(noBack)
}
