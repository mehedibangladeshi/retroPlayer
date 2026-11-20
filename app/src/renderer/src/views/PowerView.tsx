import { useEffect, useState } from 'react'
import { POWER as R, type Circle, type Rect } from '@shared/layout'
import { boostLabel, nextBoost, stepBoost } from '@shared/boost'
import { setBoost, setLoop, setShuffle } from '../engine/commands'
import { useEngine } from '../engine/useEngine'
import { useLocked } from '../useLocked'
import { importAlbumToRack } from '../input/importAlbum'
import { useKeyboard } from '../input/useKeyboard'
import { useSeekHold } from '../input/useSeekHold'
import PowerKnob from './power/PowerKnob'
import PowerMeter from './power/PowerMeter'
import PowerSeek from './power/PowerSeek'
import PowerVisualizer from './power/PowerVisualizer'
import { switchLamps } from './power/powerSwitch'
import { CHROME_SCALE } from '@shared/chrome'
import { SHADE } from '@shared/shade'
import { barSlice, splitFit, titleLayer } from './splitFit'
import './PowerView.css'

const urls = import.meta.glob<string>('@assets/power/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('power/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

const CAP_L = 40
const CAP_R = 85 // holds the baked minimize and close (design x 375..438 of 451)
const px = (v: number): number => Math.round(v * CHROME_SCALE)

const measure = (shaded: boolean): { w: number; h: number } => ({ w: window.innerWidth, h: shaded ? px(SHADE.power.barH) : window.innerHeight })

function useWindowSize(shaded: boolean): { w: number; h: number } {
  const [size, setSize] = useState(() => measure(shaded))
  useEffect(() => {
    const onResize = (): void => setSize(measure(shaded))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [shaded])
  return size
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

// BOOST lamp: no baked art, so the LED and text are code-drawn. Lower-right corner, outside the knob hit circle (r 140), above the seek bar.
const BOOST_BTN: Rect = { x: 366, y: 328, w: 62, h: 40 }
const BOOST_LED: Circle = { cx: 397, cy: 337, r: 3 }
const BOOST_TEXT_TOP = 346

const lamp = (c: Circle, color: 'red' | 'green', lit: boolean): React.ReactNode =>
  lit ? <div className={`pd-lamp ${color}`} style={{ left: c.cx - c.r, top: c.cy - c.r, width: c.r * 2, height: c.r * 2 }} /> : null

/** The power deck window: the artwork with the live knob, seek bar, visualizer and meter, the Loop/Shuffle switches (lamps follow engine options), Import Album and Power buttons, and the keyboard. */
export default function PowerView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  const win = useWindowSize(shaded)
  const barH = SHADE.power.barH
  const fit = splitFit(win.w, win.h, R.WINDOW.w, R.WINDOW.h, barH)
  const title = titleLayer(R.WINDOW.w, R.WINDOW.h, barH)
  // Bar space: fixed size, hit boxes anchored to the right edge like the baked icons.
  const bar = (r: Rect): React.CSSProperties => ({ left: win.w - (R.WINDOW.w - r.x) * CHROME_SCALE, top: r.y * CHROME_SCALE, width: r.w * CHROME_SCALE, height: r.h * CHROME_SCALE })
  const { options, optionsKnown } = useEngine()
  const locked = useLocked()
  useKeyboard(useSeekHold())
  const [importLit, setImportLit] = useState(false)
  const [importDown, setImportDown] = useState(false)
  const loop = switchLamps(options.loop)
  const shuffle = switchLamps(options.shuffle)

  return (
    <div className={`pd-stage${locked ? ' locked' : ''}`}>
      <div className="pd-bar" style={{ height: fit.barPx }}>
        {/* Base and top stretch between the caps; the mid layer holds the left-anchored title text, so it is not stretched. */}
        <div style={barSlice(layerUrl('power/power-base.png'), R.WINDOW.h, barH, CAP_L, CAP_R, R.ASSET_SCALE)} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: title.clip.height, overflow: 'hidden' }}>
          <img src={layerUrl('power/power-mid.png')} alt="" draggable={false} style={{ position: 'absolute', maxWidth: 'none', pointerEvents: 'none', ...title.img }} />
        </div>
        <div style={barSlice(layerUrl('power/power-top.png'), R.WINDOW.h, barH, CAP_L, CAP_R, R.ASSET_SCALE)} />
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="pd-titlebar" style={{ width: win.w - (R.WINDOW.w - R.MINIMIZE.x) * CHROME_SCALE - 4, height: fit.barPx }} />
        <button type="button" className={`pd-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={bar(R.MINIMIZE)} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="pd-chrome" aria-label="Close power deck" style={bar(R.CLOSE)} onClick={() => window.retro.closeWindow()} />
      </div>
      {!shaded && (
      <div className="pd-body" style={{ top: fit.top, height: win.h - fit.top }}>
      <div className="pd" style={{ width: R.WINDOW.w, height: R.WINDOW.h, left: fit.left, top: -barH * fit.scale, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <img key={l.id} className="pd-layer" src={layerUrl(l.file)} alt="" draggable={false} />)}
        <PowerVisualizer />
        <PowerMeter />
        <PowerKnob scale={fit.scale} />
        <PowerSeek scale={fit.scale} />
        <button type="button" role="switch" aria-checked={options.loop} aria-label="Loop song" disabled={!optionsKnown} className="pd-btn" style={box(R.LOOP)} onClick={() => setLoop(!options.loop)} />
        <button type="button" role="switch" aria-checked={options.shuffle} aria-label="Shuffle" disabled={!optionsKnown} className="pd-btn" style={box(R.SHUFFLE)} onClick={() => setShuffle(!options.shuffle)} />
        {lamp(R.LOOP_RED, 'red', loop.red)}
        {lamp(R.LOOP_GREEN, 'green', loop.green)}
        {lamp(R.SHUFFLE_RED, 'red', shuffle.red)}
        {lamp(R.SHUFFLE_GREEN, 'green', shuffle.green)}
        <div className={`pd-lamp green${options.boostDb > 0 ? '' : ' off'}`} style={{ left: BOOST_LED.cx - BOOST_LED.r, top: BOOST_LED.cy - BOOST_LED.r, width: BOOST_LED.r * 2, height: BOOST_LED.r * 2 }} />
        <div className="pd-boost-text" style={{ left: BOOST_BTN.x, width: BOOST_BTN.w, top: BOOST_TEXT_TOP }}>BOOST<br />{boostLabel(options.boostDb)}</div>
        <button
          type="button"
          aria-label={`Volume boost ${boostLabel(options.boostDb)}`}
          className="pd-btn"
          disabled={!optionsKnown}
          style={box(BOOST_BTN)}
          onClick={() => setBoost(nextBoost(options.boostDb))}
          onWheel={(e) => setBoost(stepBoost(options.boostDb, e.deltaY < 0 ? 1 : -1))}
        />
        <button
          type="button"
          aria-label="Import album"
          className="pd-btn"
          disabled={!optionsKnown}
          style={box(R.IMPORT)}
          onPointerDown={() => setImportDown(true)}
          onPointerUp={() => setImportDown(false)}
          onPointerLeave={() => setImportDown(false)}
          onClick={() => {
            setImportLit(true)
            setTimeout(() => setImportLit(false), 300)
            void importAlbumToRack()
          }}
        />
        {lamp(R.IMPORT_LAMP, 'red', importDown || importLit)}
        <button type="button" aria-label="Power off (quit)" className="pd-btn" style={box(R.POWER_BTN)} onClick={() => window.retro.quit()} />
        {lamp(R.POWER_LAMP, 'red', true)}
      </div>
      </div>
      )}
    </div>
  )
}
