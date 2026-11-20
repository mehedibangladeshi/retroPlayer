import { useEffect, useRef, useState } from 'react'
import { POWER as R } from '@shared/layout'
import { useEngine } from '../../engine/useEngine'
import { setVolume } from '../../engine/commands'
import { angleVolume, knobRotation, pointerAngle, stepVolume, turnVolume } from '../powerMath'
import { knobVolume, PENDING_TIMEOUT_MS, settlePending, shownVolume, type Pending } from './knobValue'
import './PowerKnob.css'

const urls = import.meta.glob<string>('@assets/power/*.png', { query: '?url', import: 'default', eager: true })
const volumeUrl = Object.entries(urls).find(([k]) => k.endsWith('/power-volume.png'))?.[1] ?? ''

const now = (): number => Date.now()
const { cx, cy, r } = R.KNOB
const HIT_R = 140 // the knob plus its ring of scale dots (at ~131 design px), so a click beside the knob turns it too
const CLICK_PX = 3 // a press that moves less than this (design px) is a click, not a drag

/** Volume knob: a rotated copy of the knob disc over the static scale, driven by engine volume; grab and rotate, wheel, or click on or around it to turn it to that spot. */
export default function PowerKnob({ scale }: { scale: number }) {
  const { options, optionsKnown } = useEngine()
  const [pending, setPending] = useState<Pending>(null) // what the user just set, shown until the engine echoes
  const shown = shownVolume(pending, options.volume)
  const kv = knobVolume(optionsKnown, options.volume, pending)
  const drag = useRef<{ x: number; y: number; v: number; deg: number | null; moved: boolean } | null>(null)
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
  const step = (dir: -1 | 1): void => { if (!optionsKnown && !pending) return; const v = stepVolume(shown, dir); setPending({ value: v, at: now() }); setVolume(v) }
  const endDrag = (): void => { drag.current = null }
  const set = (v: number): void => { setPending({ value: v, at: now() }); send(v) }

  return (
    <>
      <img className="pk-disc" src={volumeUrl} alt="" draggable={false}
        style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${knobRotation(kv ?? 0)}deg)`, visibility: kv === null ? 'hidden' : 'visible' }} />
      <div className="pk-hit" role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.round(shown * 100) / 10}
        style={{ left: cx - HIT_R, top: cy - HIT_R, width: HIT_R * 2, height: HIT_R * 2 }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (!optionsKnown && !pending)) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const box = e.currentTarget.getBoundingClientRect()
          drag.current = { x: e.clientX, y: e.clientY, v: shown, deg: pointerAngle((e.clientX - box.left - box.width / 2) / scale, (e.clientY - box.top - box.height / 2) / scale), moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) / scale < CLICK_PX) return
          d.moved = true
          const box = e.currentTarget.getBoundingClientRect()
          const deg = pointerAngle((e.clientX - box.left - box.width / 2) / scale, (e.clientY - box.top - box.height / 2) / scale)
          if (deg === null) return // near the centre: no direction, keep the last angle
          if (d.deg !== null) { d.v = turnVolume(d.v, d.deg, deg); set(d.v) }
          d.deg = deg
        }}
        onPointerUp={(e) => {
          const d = drag.current
          if (d && !d.moved) {
            const box = e.currentTarget.getBoundingClientRect()
            const v = angleVolume((d.x - box.left - box.width / 2) / scale, (d.y - box.top - box.height / 2) / scale)
            if (v !== null) set(v)
          }
          endDrag()
        }}
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
