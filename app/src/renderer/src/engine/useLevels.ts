import { useEffect, useState } from 'react'
import type { EngineEvent } from '@shared/protocol'

export interface Levels {
  rms: number
  peak: number
  bands: number[]
  wave: number[]
}
const ZERO: Levels = { rms: 0, peak: 0, bands: [], wave: [] }
const STALE_MS = 150

/** Latest `levels` event, or zeros once none arrived for 150 ms. Kept out of the store: ~20 events/s. */
export function useLevels(): Levels {
  const [levels, setLevels] = useState<Levels>(ZERO)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = window.retro.onEvent((e: EngineEvent) => {
      if (e.type !== 'levels') return
      setLevels({ rms: e.rms, peak: e.peak, bands: e.bands, wave: e.wave })
      clearTimeout(timer)
      timer = setTimeout(() => setLevels(ZERO), STALE_MS)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])
  return levels
}
