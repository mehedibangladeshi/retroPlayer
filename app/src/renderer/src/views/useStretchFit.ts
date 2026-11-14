import { useEffect, useState } from 'react'
import { stretchFit } from './stretchFit'

/** stretchFit for the current window, tracked on resize and when the shade flips (shaded, `barH` sets the scale). */
export function useStretchFit(designW: number, designH: number, barH: number, shaded: boolean): { scale: number; w: number; h: number } {
  const calc = (): { scale: number; w: number; h: number } => stretchFit(window.innerWidth, window.innerHeight, designW, designH, shaded ? barH : undefined)
  const [fit, setFit] = useState(calc)
  useEffect(() => {
    const onResize = (): void => setFit(calc())
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calc only reads these props
  }, [designW, designH, barH, shaded])
  return fit
}
