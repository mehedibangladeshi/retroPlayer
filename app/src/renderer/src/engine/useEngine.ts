import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSnapshot, subscribe, type EngineState } from './store'

export function useEngine(): EngineState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Position for display: smoothed between `position` events only while playing.
 * Consumers only show mm:ss, so the animated value is floored to whole seconds:
 * setState bails out on an equal value and the player re-renders once a second, not every frame.
 */
export function useDisplayPosition(): number {
  const { status, positionMs, durationMs, lastPositionAt } = useEngine()
  const [animated, setAnimated] = useState({ key: -1, value: 0 })
  const playing = status === 'playing'

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const frame = (): void => {
      const p = positionMs + (performance.now() - lastPositionAt)
      setAnimated({ key: lastPositionAt, value: Math.floor((durationMs === null ? p : Math.min(p, durationMs)) / 1000) * 1000 })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [playing, positionMs, durationMs, lastPositionAt])

  return playing && animated.key === lastPositionAt ? animated.value : positionMs
}
