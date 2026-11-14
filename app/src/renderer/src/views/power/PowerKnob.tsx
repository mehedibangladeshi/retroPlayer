import { useEffect, useRef, useState } from 'react'
import { POWER as R } from '@shared/layout'
import { useEngine } from '../../engine/useEngine'
import { setVolume } from '../../engine/commands'
import { dragVolume, knobRotation, stepVolume } from '../powerMath'
import { PENDING_TIMEOUT_MS, settlePending, shownVolume, type Pending } from './knobValue'
import './PowerKnob.css'

const urls = import.meta.glob<string>('@assets/power/*.png', { query: '?url', import: 'default', eager: true })
const volumeUrl = Object.entries(urls).find(([k]) => k.endsWith('/power-volume.png'))?.[1] ?? ''

const now = (): number => Date.now()
const { cx, cy, r } = R.KNOB

/** Volume knob: a rotated copy of the knob disc over the static scale, driven by engine volume; drag up/down or wheel to change. */
export default function PowerKnob({ scale }: { scale: number }) {
  const { options } = useEngine()
  const [pending, setPending] = useState<Pending>(null) // what the user just set, shown until the engine echoes
  const shown = shownVolume(pending, options.volume)
  const drag = useRef<{ y: number; v: number } | null>(null)
  const queued = useRef<number | null>(null)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const send = (v: number): void => {
    queued.current = v
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      if (queued.current !== null) setVolume(queued.current)
      queued.current = null
    })
  }
  useEffect(() => {
    if (!pending) return
    // Timer callback only (no sync setState): fires at once when the engine already echoed, else at the timeout.
    const wait = settlePending(pending, options.volume, now()) === null ? 0 : PENDING_TIMEOUT_MS - (now() - pending.at)
    const t = setTimeout(() => setPending((p) => settlePending(p, options.volume, now())), Math.max(0, wait))
    return () => clearTimeout(t)
  }, [pending, options.volume])
  // Steps start from the shown value, which is fresh between fast wheel/key events.
  const step = (dir: -1 | 1): void => { const v = stepVolume(shown, dir); setPending({ value: v, at: now() }); setVolume(v) }
  const endDrag = (): void => { drag.current = null }

  return (
    <>
      <img className="pk-disc" src={volumeUrl} alt="" draggable={false}
        style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${knobRotation(shown)}deg)` }} />
      <div className="pk-hit" role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.round(shown * 100) / 10}
        style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: shown } }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const v = dragVolume(drag.current.v, (e.clientY - drag.current.y) / scale)
          setPending({ value: v, at: now() })
          send(v)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onWheel={(e) => step(e.deltaY < 0 ? 1 : -1)}
        onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation() }}
        onKeyDown={(e) => {
          const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
          if (dir) { e.preventDefault(); e.stopPropagation(); step(dir) }
        }} />
    </>
  )
}
