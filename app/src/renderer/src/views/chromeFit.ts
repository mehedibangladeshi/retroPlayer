import { useEffect, useState } from 'react'
import { CHROME_SCALE } from '@shared/chrome'

export type Fit = { scale: number; w: number; h: number }

/** Free windows (playlist, rack): everything is drawn at the fixed CHROME_SCALE, so the title bar, frame and text keep
 *  one screen size; a bigger window shows more area, a smaller one less (w x h, design px), down to `min` (FREE_MIN_COMP,
 *  which main also enforces as the window minimum). Shaded, only the bar shows. */
export function chromeFit(innerW: number, innerH: number, min: { w: number; h: number }, shaded = false): Fit {
  return { scale: CHROME_SCALE, w: Math.max(min.w, innerW / CHROME_SCALE), h: shaded ? min.h : Math.max(min.h, innerH / CHROME_SCALE) }
}

/** chromeFit for the current window, tracked on resize. */
export function useChromeFit(min: { w: number; h: number }, shaded: boolean): Fit {
  const [fit, setFit] = useState(() => chromeFit(window.innerWidth, window.innerHeight, min, shaded))
  useEffect(() => {
    const on = (): void => setFit(chromeFit(window.innerWidth, window.innerHeight, min, shaded))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [min, shaded])
  return fit
}
