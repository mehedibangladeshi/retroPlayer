import { useEffect, useRef, useState } from 'react'
import { POWER } from '@shared/layout'
import { useLevels } from '../../engine/useLevels'
import { powerKeyAction } from '../../input/powerKeys'
import { smoothBands, wavePoints } from './smoothing'
import './PowerVisualizer.css'

const { VIS } = POWER
const BARS = 16
const GAP = 3
const BAR_W = (VIS.w - GAP * (BARS + 1)) / BARS
const FALL = 0.002 // fraction of full height per ms
const CAP_FALL = 0.0006

export default function PowerVisualizer(): React.JSX.Element {
  const levels = useLevels()
  const [mode, setMode] = useState<'bars' | 'wave'>('bars')
  const latest = useRef(levels)
  useEffect(() => {
    latest.current = levels
  })
  const barRefs = useRef<(SVGRectElement | null)[]>([])
  const capRefs = useRef<(SVGRectElement | null)[]>([])
  const toggle = (): void => setMode((m) => (m === 'bars' ? 'wave' : 'bars'))

  // Heights are written straight to the DOM from rAF, so React does not re-render at 60 fps.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let heights: number[] = []
    let caps: number[] = []
    const frame = (now: number): void => {
      const dt = Math.min(now - last, 100)
      last = now
      heights = smoothBands(heights, latest.current.bands, dt, FALL, BARS)
      caps = smoothBands(caps, heights, dt, CAP_FALL, BARS)
      heights.forEach((h, i) => {
        const bh = h * (VIS.h - 8)
        barRefs.current[i]?.setAttribute('y', String(VIS.h - 4 - bh))
        barRefs.current[i]?.setAttribute('height', String(bh))
        capRefs.current[i]?.setAttribute('y', String(VIS.h - 4 - caps[i] * (VIS.h - 8) - 2))
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (powerKeyAction(e) === 'visualizer') toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <svg
      className="pvis"
      style={{ left: VIS.x, top: VIS.y, width: VIS.w, height: VIS.h }}
      viewBox={`0 0 ${VIS.w} ${VIS.h}`}
      role="button"
      aria-label={`Visualizer: ${mode === 'bars' ? 'spectrum' : 'wave'}, click to switch`}
      onClick={toggle}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="grid" x1={0} x2={VIS.w} y1={VIS.h * f} y2={VIS.h * f} />
      ))}
      <g className="glow" display={mode === 'bars' ? undefined : 'none'}>
        {Array.from({ length: BARS }, (_, i) => {
          const x = GAP + i * (BAR_W + GAP)
          return (
            <g key={i}>
              <rect ref={(el) => { barRefs.current[i] = el }} className="bar" x={x} y={VIS.h - 4} width={BAR_W} height={0} />
              <rect ref={(el) => { capRefs.current[i] = el }} className="cap" x={x} y={VIS.h - 6} width={BAR_W} height={2} />
            </g>
          )
        })}
      </g>
      {mode === 'wave' && (
        <polyline className="wave glow" points={wavePoints(levels.wave, VIS.w, VIS.h * 0.8)} transform={`translate(0 ${VIS.h * 0.1})`} />
      )}
    </svg>
  )
}
