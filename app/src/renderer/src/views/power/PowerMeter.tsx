import { useEffect, useRef } from 'react'
import { POWER } from '@shared/layout'
import { useLevels } from '../../engine/useLevels'
import { decay, needleAngle } from '../powerMath'
import './PowerMeter.css'

const { METER, METER_PIVOT: P, METER_NEEDLE, METER_MIN_DEG, METER_MAX_DEG } = POWER
const FACE = '#b1ad9f' // sampled from power-mid.png next to the baked needle
const INK = '#47484d'
const HUB = '#9f9f9f'

export default function PowerMeter(): React.JSX.Element {
  const level = useLevels().rms
  const rms = useRef(level)
  useEffect(() => {
    rms.current = level
  })
  const needle = useRef<SVGGElement>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let v = 0
    const frame = (now: number): void => {
      v = decay(v, rms.current, Math.min(now - last, 100), 0.0008)
      last = now
      needle.current?.setAttribute('transform', `rotate(${needleAngle(v, METER_MIN_DEG, METER_MAX_DEG) - METER_MIN_DEG} ${P.x} ${P.y})`)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // The needle is drawn at the rest pose (pointing left, METER_MIN_DEG) and rotated by the difference.
  const tipX = P.x - METER_NEEDLE
  return (
    <svg
      className="pmeter"
      style={{ left: METER.x, top: METER.y, width: METER.w, height: METER.h }}
      viewBox={`${METER.x} ${METER.y} ${METER.w} ${METER.h}`}
      aria-hidden="true"
    >
      {/* cover the baked needle (shaft + arrowhead) with the face colour */}
      <rect x={tipX - 1} y={P.y - 5.5} width={METER_NEEDLE - 8} height={11} fill={FACE} />
      <g ref={needle}>
        <line x1={P.x} y1={P.y} x2={tipX} y2={P.y} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      </g>
      {/* pivot ring redrawn on top, same as the artwork */}
      <circle cx={P.x} cy={P.y} r={8} fill={HUB} stroke={INK} strokeWidth={1.4} />
      <circle cx={P.x} cy={P.y} r={3.2} fill={HUB} stroke={INK} strokeWidth={1} />
    </svg>
  )
}
