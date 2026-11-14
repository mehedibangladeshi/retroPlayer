import { useEffect, useState } from 'react'
import { nineSlice } from './stretchFit'
import { useStretchFit } from './useStretchFit'
import { RACK as R, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import { SPINE_ASPECT, type RackState } from '@shared/rack'
import { moveDir } from './rackOrder'
import fontUrl from '@assets/playlist/fonts/Montserrat-VariableFont_wght.ttf?url'
import './RackView.css'

const urls = import.meta.glob<string>('@assets/rack/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('rack/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })
const right = (r: Rect, dw: number): Rect => ({ ...r, x: r.x + dw }) // anchored to the right edge

// The shelf is the inner panel (assets/ui/MANIFEST.md, "Cassette rack"); it stretches with the window.
const SHELF = { x: 17, y: 65, w: 1587, h: 845.5 }
const SHELF_MARGIN = 24
const SPINE_MIME = 'application/x-rack-spine' // our own reorder drags, told apart from OS file drops

/** The cassette rack window: the album history as a row of cassette spines on the shelf. */
export default function RackView() {
  const [shaded, setShaded] = useState(false)
  useEffect(() => window.retro.onShaded(setShaded), [])
  // A free window: the composition grows to fill it, the art drawn nine-slice (see RACK.SLICE).
  const fit = useStretchFit(R.WINDOW.w, R.WINDOW.h, SHADE.rack.barH, shaded)
  const dw = fit.w - R.WINDOW.w
  const dh = fit.h - R.WINDOW.h

  const [rack, setRack] = useState<RackState>({ sort: 'recent', spines: [] })
  useEffect(() => {
    let live = true
    void window.retro.getRack().then((s) => live && setRack(s))
    const off = window.retro.onRack(setRack)
    return () => { live = false; off() }
  }, [])
  const custom = rack.sort === 'custom'
  const [gap, setGap] = useState<number | null>(null) // drop indicator: the insertion index while reordering

  const shelfH = SHELF.h + dh
  const spineW = (shelfH - 2 * SHELF_MARGIN) * SPINE_ASPECT

  // OS drops anywhere on the rack: folders become albums, plain files are ignored. Never let the window navigate.
  const onDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    if (!e.dataTransfer.types.includes(SPINE_MIME)) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('.rk-spine')
    if (!el) { setGap(null); return } // off a spine: a drop here reorders nothing
    const r = el.getBoundingClientRect()
    setGap(Number(el.dataset.index) + (e.clientX > r.left + r.width / 2 ? 1 : 0))
  }
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const dirs = rack.spines.map((s) => s.dir)
    const from = e.dataTransfer.getData(SPINE_MIME)
    if (from !== '') {
      // Dragged by dir, not index, so a rack push mid-drag can't move the wrong spine.
      if (gap !== null && dirs.includes(from)) window.retro.rackReorder(moveDir(dirs, dirs.indexOf(from), gap))
    } else {
      const add: string[] = []
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (!e.dataTransfer.items[i].webkitGetAsEntry()?.isDirectory) continue
        const file = e.dataTransfer.items[i].getAsFile()
        const path = file && window.retro.pathForFile(file)
        if (path) add.push(path)
      }
      if (add.length) window.retro.rackAdd(add)
    }
    setGap(null)
  }

  return (
    <div className="rk-stage" onDragOver={onDragOver} onDrop={onDrop} onDragEnd={() => setGap(null)}>
      <style>{`@font-face { font-family: 'Montserrat'; src: url(${fontUrl}) format('truetype'); font-weight: 100 900; }`}</style>
      <div className="rk" style={{ width: fit.w, height: fit.h, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <div key={l.id} className="rk-layer" style={nineSlice(layerUrl(l.file), R.SLICE, R.ASSET_SCALE, fit)} />)}
        <div
          className="rk-shelf"
          style={{ ...box({ ...SHELF, w: SHELF.w + dw, h: shelfH }), padding: SHELF_MARGIN, gap: SHELF_MARGIN / 2 }}
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}
          onContextMenu={(e) => { e.preventDefault(); window.retro.rackMenu(null) }}
        >
          {rack.spines.map((s, i) => (
            <button
              key={s.dir}
              type="button"
              className={`rk-spine${gap === i ? ' drop-before' : ''}${gap === i + 1 && i === rack.spines.length - 1 ? ' drop-after' : ''}`}
              aria-label={s.text}
              data-index={i}
              draggable={custom}
              onDragStart={custom ? (e) => { e.dataTransfer.setData(SPINE_MIME, s.dir); e.dataTransfer.effectAllowed = 'move' } : undefined}
              style={{ width: spineW, ['--sw' as string]: `${spineW}px`, color: s.ink, background: s.image ? `${s.bg} url(${s.image}) center / cover no-repeat` : s.bg }}
              onClick={() => window.retro.rackPlay(s.dir)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); window.retro.rackMenu(s.dir) }}
            >
              <span className="rk-spine-text">{s.text}</span>
            </button>
          ))}
        </div>
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="rk-titlebar" style={{ width: R.MINIMIZE.x + dw - 4, height: SHADE.rack.barH }} />
        <button type="button" className={`rk-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(right(R.MINIMIZE, dw))} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="rk-chrome" aria-label="Close cassette rack" style={box(right(R.CLOSE, dw))} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
