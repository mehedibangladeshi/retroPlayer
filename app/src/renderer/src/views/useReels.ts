import { useEffect, useRef, useState } from 'react'
import type { Status } from '@shared/protocol'
import type { SeekDirection } from '../input/useSeekHold'

const REV_PER_SEC = 1 / 2.4
const SEEK_FACTOR = 4
const TAU_MS = 250
const EPS_DEG_PER_SEC = 0.5

/** Rotates the given elements via refs (no React re-render per frame). Returns the two refs to attach; owns a rAF loop that sleeps when idle. */
export function useReels(status: Status, held: SeekDirection | null) {
  const left = useRef<HTMLImageElement>(null)
  const right = useRef<HTMLImageElement>(null)
  const target = useRef(0)
  const wake = useRef<() => void>(() => {})

  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  let t = 0
  if (!reduced) {
    if (held === 'forward') t = REV_PER_SEC * SEEK_FACTOR
    else if (held === 'back') t = -REV_PER_SEC * SEEK_FACTOR
    else if (status === 'playing') t = REV_PER_SEC
  }
  const targetDeg = t * 360 // deg/sec

  useEffect(() => {
    let angle = 0
    let vel = 0
    let last = 0
    let raf = 0
    const frame = (now: number): void => {
      const dt = Math.max(0, Math.min(now - last, 100))
      last = now
      vel += (target.current - vel) * (1 - Math.exp(-dt / TAU_MS))
      if (target.current === 0 && Math.abs(vel) < EPS_DEG_PER_SEC) {
        vel = 0
        raf = 0
        return
      }
      angle = (angle + (vel * dt) / 1000) % 360
      for (const el of [left.current, right.current]) if (el) el.style.transform = `rotate(${angle.toFixed(2)}deg)`
      raf = requestAnimationFrame(frame)
    }
    wake.current = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    wake.current()
    return () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }, [])

  useEffect(() => {
    target.current = targetDeg
    wake.current()
  }, [targetDeg])

  return { left, right }
}
