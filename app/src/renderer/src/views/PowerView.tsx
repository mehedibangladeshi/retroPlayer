import { useEffect, useState } from 'react'
import { POWER as R, type Circle, type Rect } from '@shared/layout'
import { setLoop, setShuffle } from '../engine/commands'
import { useEngine } from '../engine/useEngine'
import { openAlbum } from '../input/openFile'
import { useKeyboard } from '../input/useKeyboard'
import { useSeekHold } from '../input/useSeekHold'
import PowerKnob from './power/PowerKnob'
import PowerMeter from './power/PowerMeter'
import PowerSeek from './power/PowerSeek'
import PowerVisualizer from './power/PowerVisualizer'
import { switchLamps } from './power/powerSwitch'
import { SHADE } from '@shared/shade'
import './PowerView.css'

const urls = import.meta.glob<string>('@assets/power/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('power/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

/** Scale that fits the composition inside the viewport (letterboxed); shaded, the window is only the top bar. */
const compute = (shaded: boolean): { scale: number; left: number; top: number } => {
  if (shaded) return { scale: window.innerWidth / SHADE.power.designW, left: 0, top: 0 }
  const scale = Math.min(window.innerWidth / R.WINDOW.w, window.innerHeight / R.WINDOW.h)
  return { scale, left: (window.innerWidth - R.WINDOW.w * scale) / 2, top: (window.innerHeight - R.WINDOW.h * scale) / 2 }
}

function useFitScale(shaded: boolean): { scale: number; left: number; top: number } {
  const [fit, setFit] = useState(() => compute(shaded))
  useEffect(() => {
    const onResize = (): void => setFit(compute(shaded))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [shaded])
  return fit
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

const lamp = (c: Circle, color: 'red' | 'green', lit: boolean): React.ReactNode =>
  lit ? <div className={`pd-lamp ${color}`} style={{ left: c.cx - c.r, top: c.cy - c.r, width: c.r * 2, height: c.r * 2 }} /> : null

/** The power deck window: the artwork with the live knob, seek bar, visualizer and meter, the Loop/Shuffle switches (lamps follow engine options), Import Album and Power buttons, and the keyboard. */
export default function PowerView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const fit = useFitScale(shaded)
  const { options } = useEngine()
  useKeyboard(useSeekHold())
  const [importLit, setImportLit] = useState(false)
  const [importDown, setImportDown] = useState(false)
  const loop = switchLamps(options.loop)
  const shuffle = switchLamps(options.shuffle)

  return (
    <div className="pd-stage">
      <div className="pd" style={{ width: R.WINDOW.w, height: R.WINDOW.h, left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <img key={l.id} className="pd-layer" src={layerUrl(l.file)} alt="" draggable={false} />)}
        <PowerVisualizer />
        <PowerMeter />
        <PowerKnob scale={fit.scale} />
        <PowerSeek scale={fit.scale} />
        <button type="button" role="switch" aria-checked={options.loop} aria-label="Loop song" className="pd-btn" style={box(R.LOOP)} onClick={() => setLoop(!options.loop)} />
        <button type="button" role="switch" aria-checked={options.shuffle} aria-label="Shuffle" className="pd-btn" style={box(R.SHUFFLE)} onClick={() => setShuffle(!options.shuffle)} />
        {lamp(R.LOOP_RED, 'red', loop.red)}
        {lamp(R.LOOP_GREEN, 'green', loop.green)}
        {lamp(R.SHUFFLE_RED, 'red', shuffle.red)}
        {lamp(R.SHUFFLE_GREEN, 'green', shuffle.green)}
        <button
          type="button"
          aria-label="Import album"
          className="pd-btn"
          style={box(R.IMPORT)}
          onPointerDown={() => setImportDown(true)}
          onPointerUp={() => setImportDown(false)}
          onPointerLeave={() => setImportDown(false)}
          onClick={() => {
            setImportLit(true)
            setTimeout(() => setImportLit(false), 300)
            void openAlbum()
          }}
        />
        {lamp(R.IMPORT_LAMP, 'red', importDown || importLit)}
        <button type="button" aria-label="Power off (quit)" className="pd-btn" style={box(R.POWER_BTN)} onClick={() => window.retro.quit()} />
        {lamp(R.POWER_LAMP, 'red', true)}
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="pd-titlebar" style={{ width: R.MINIMIZE.x - 4, height: SHADE.power.barH }} />
        <button type="button" className={`pd-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(R.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="pd-chrome" aria-label="Close power deck" style={box(R.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
