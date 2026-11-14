import { useEffect, useRef, useState } from 'react'
import { nineSlice } from './stretchFit'
import { useStretchFit } from './useStretchFit'
import { RACK as R, type Rect } from '@shared/layout'
import { SHADE } from '@shared/shade'
import { SPINE_ASPECT, type RackState } from '@shared/rack'
import { moveDir } from './rackOrder'
import { dragGhostBox } from './rackDrag'
import { PREVIEW_DELAY_MS, spineClick, spineKey } from './rackClick'
import { previewPlacement } from './rackPreview'
import { textMetrics } from './playlistText'
import TrackRows from './TrackRows'
import type { Album } from '@shared/protocol'
import fontUrl from '@assets/playlist/fonts/Montserrat-VariableFont_wght.ttf?url'
import './RackView.css'

const urls = import.meta.glob<string>('@assets/rack/*.png', { query: '?url', import: 'default', eager: true })
const layerUrl = (file: string): string => {
  const hit = Object.entries(urls).find(([k]) => k.endsWith(`/${file.replace('rack/', '')}`))
  if (!hit) throw new Error(`missing artwork ${file}`)
  return hit[1]
}

// Off-screen, unscaled copy of the spine (inside a bare .rk so its CSS applies) used as the drag image.
function setSpineDragImage(e: React.DragEvent<HTMLElement>): void {
  const b = dragGhostBox(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)
  const host = document.createElement('div')
  host.className = 'rk rk-ghost'
  host.style.cssText = 'position:fixed;left:-10000px;top:0;transform:none'
  const clone = e.currentTarget.cloneNode(true) as HTMLElement
  clone.style.width = `${b.w}px`
  clone.style.height = `${b.h}px`
  clone.style.setProperty('--sw', `${b.w}px`)
  host.appendChild(clone)
  document.body.appendChild(host)
  e.dataTransfer.setDragImage(clone, b.ox, b.oy)
  setTimeout(() => host.remove(), 0) // the browser snapshots synchronously
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

  // Which spine's preview is open; a single click opens it after a delay.
  const [previewDir, setPreviewDir] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null) // previewDir for async callbacks (stale tracklist replies)
  // The tracklist panel; it outlives previewDir while it slides back, then unmounts on the paper's transitionend.
  const [opened, setOpened] = useState<string | null>(null) // dir whose panel has had its first hidden frame, so the slide-in can transition
  const [panel, setPanel] = useState<{ dir: string; text: string; left: number; w: number; side: 'right' | 'left' } | null>(null)
  const [tracks, setTracks] = useState<{ dir: string; album: Album } | null>(null)
  const shelfRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewDelay = useRef(PREVIEW_DELAY_MS)
  useEffect(() => { void window.retro.doubleClickMs().then((ms) => { previewDelay.current = ms }) }, [])
  const dragRef = useRef(false)
  const closePreview = (): void => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    previewRef.current = null
    setPreviewDir(null)
  }
  const openPreview = (dir: string): void => {
    const shelf = shelfRef.current
    const el = shelf?.querySelector<HTMLElement>(`.rk-spine[data-dir="${CSS.escape(dir)}"]`)
    if (!shelf || !el) return
    // offset*/client*/scroll* are layout px, i.e. design px: the .rk scale transform doesn't affect them.
    const w = Math.max(el.offsetWidth * 2, Math.min(el.offsetWidth * 6, shelf.clientWidth - 2 * SHELF_MARGIN - el.offsetWidth))
    const at = previewPlacement({ left: el.offsetLeft, width: el.offsetWidth }, { scrollLeft: shelf.scrollLeft, width: shelf.clientWidth }, w)
    previewRef.current = dir
    setPreviewDir(dir)
    setPanel({ dir, text: el.getAttribute('aria-label') ?? '', w, ...at })
    void window.retro.rackTracks(dir).catch(() => null).then((a) => {
      if (previewRef.current !== dir) return // the preview moved on meanwhile
      if (a) setTracks({ dir, album: a })
      else closePreview() // folder gone (main drops the spine) or timed out
    })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closePreview() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', closePreview)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('blur', closePreview); if (pending.current) clearTimeout(pending.current) }
  }, [])
  const playSpine = (dir: string): void => { closePreview(); window.retro.rackPlay(dir) }
  const togglePreview = (dir: string): void => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    if (previewRef.current === dir) closePreview()
    else openPreview(dir)
  }
  const onSpineClick = (e: React.MouseEvent, dir: string): void => {
    const act = spineClick(e.detail, dragRef.current)
    if (act === 'play') playSpine(dir)
    else if (act === 'preview') {
      if (previewDir === dir) { closePreview(); return }
      if (pending.current) clearTimeout(pending.current)
      pending.current = setTimeout(() => { pending.current = null; openPreview(dir) }, previewDelay.current)
    }
  }
  const onSpineKey = (e: React.KeyboardEvent, dir: string): void => {
    const act = spineKey(e.key)
    if (!act) return
    e.preventDefault()
    if (act === 'play') playSpine(dir)
    else togglePreview(dir)
  }
  const adding = useRef(false) // a double-click on "+" opens one dialog, not two
  const addAlbum = async (): Promise<void> => {
    if (adding.current) return
    adding.current = true
    try {
      const p = await window.retro.openFolderDialog()
      if (p) window.retro.rackAdd([p])
    } finally { adding.current = false }
  }
  // Also run from the stage: a rack push can unmount the dragged spine, and then its own dragend never fires.
  const endDrag = (): void => { setDragging(false); setTimeout(() => { dragRef.current = false }, 0) } // after the click that follows a drop
  // Pressing anywhere but the previewed spine or its panel dismisses the preview.
  const onStagePointerDown = (e: React.PointerEvent): void => {
    const t = e.target as HTMLElement
    if (!t.closest('.rk-preview, .rk-spine.previewing')) closePreview()
  }

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
    endDrag()
  }

  // A stale previewDir (its spine vanished) opens nothing; the panel slides back whenever this isn't its dir.
  const openDir = previewDir !== null && rack.spines.some((s) => s.dir === previewDir) ? previewDir : null
  const closing = panel !== null && panel.dir !== openDir
  const text = textMetrics(fit.scale)
  const panelDir = panel?.dir ?? null
  // Mount hidden, then flip to open two frames later so the browser has painted the hidden position.
  useEffect(() => {
    if (panelDir === null) return
    let r2 = 0
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOpened(panelDir)) })
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [panelDir])
  // Fallback so a closing panel unmounts even if no transform transition runs (reduced motion, closed before it opened).
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => { setPanel(null); setOpened(null) }, 300)
    return () => clearTimeout(t)
  }, [closing])

  return (
    <div className="rk-stage" onDragOver={onDragOver} onDrop={onDrop} onDragEnd={() => { setGap(null); endDrag() }} onPointerDown={onStagePointerDown}>
      <style>{`@font-face { font-family: 'Montserrat'; src: url(${fontUrl}) format('truetype'); font-weight: 100 900; }`}</style>
      <div className={`rk${dragging ? ' dragging' : ''}`} style={{ width: fit.w, height: fit.h, transform: `scale(${fit.scale})` }}>
        {R.LAYERS.map((l) => <div key={l.id} className="rk-layer" style={nineSlice(layerUrl(l.file), R.SLICE, R.ASSET_SCALE, fit)} />)}
        <div
          className="rk-shelf"
          ref={shelfRef}
          style={{ ...box({ ...SHELF, w: SHELF.w + dw, h: shelfH }), padding: SHELF_MARGIN, gap: SHELF_MARGIN / 2 }}
          onWheel={(e) => { closePreview(); e.currentTarget.scrollLeft += e.deltaY }}
          onContextMenu={(e) => { e.preventDefault(); closePreview(); window.retro.rackMenu(null) }}
        >
          {rack.spines.map((s, i) => (
            <button
              key={s.dir}
              type="button"
              className={`rk-spine${gap === i ? ' drop-before' : ''}${gap === i + 1 && i === rack.spines.length - 1 ? ' drop-after' : ''}${previewDir === s.dir ? ' previewing' : ''}`}
              aria-label={s.text}
              data-index={i}
              data-dir={s.dir}
              draggable={custom}
              onDragStart={custom ? (e) => { dragRef.current = true; setDragging(true); closePreview(); e.dataTransfer.setData(SPINE_MIME, s.dir); e.dataTransfer.effectAllowed = 'move'; setSpineDragImage(e) } : undefined}
              style={{ width: spineW, ['--sw' as string]: `${spineW}px`, color: s.ink, background: s.image ? `${s.bg} url(${s.image}) center / cover no-repeat` : s.bg }}
              onDragEnd={endDrag}
              onClick={(e) => onSpineClick(e, s.dir)}
              onKeyDown={(e) => onSpineKey(e, s.dir)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); closePreview(); window.retro.rackMenu(s.dir) }}
            >
              <span className="rk-spine-text">{s.text}</span>
            </button>
          ))}
          <button
            type="button"
            className="rk-add"
            aria-label="Add album to rack"
            style={{ width: spineW, ['--sw' as string]: `${spineW}px` }}
            onClick={() => void addAlbum()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); closePreview() }}
          >
            +
          </button>
          {panel && (
            <div
              key={panel.dir}
              className={`rk-preview ${panel.side}${opened === panel.dir && !closing ? ' open' : ''}`}
              style={{ left: panel.left, top: SHELF_MARGIN, width: panel.w, height: shelfH - 2 * SHELF_MARGIN, ['--sw' as string]: `${spineW}px` }}
              onWheel={(e) => e.stopPropagation()}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
              onTransitionEnd={(e) => { if (closing && (e.target as HTMLElement).classList.contains('rk-preview-paper') && e.propertyName === 'transform') { setPanel(null); setOpened(null) } }}
            >
              <div className="rk-preview-paper">
                <div className="rk-preview-heading" style={{ fontSize: text.heading, lineHeight: `${text.heading * 1.4}px` }}>{panel.text}</div>
                {/* Read-only for now: rows have no click handler, so double-click does nothing. */}
                <div className="rk-preview-rows">
                  {tracks?.dir === panel.dir
                    ? <TrackRows album={tracks.album} pitch={text.pitch} rowFont={text.row} padLeft={0} />
                    : <p className="rk-preview-loading" style={{ fontSize: text.row }}>Loading…</p>}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* The only drag region: no children, ends left of the minimize button. */}
        <div className="rk-titlebar" style={{ width: R.MINIMIZE.x + dw - 4, height: SHADE.rack.barH }} />
        <button type="button" className={`rk-chrome${shaded ? ' shaded' : ''}`} aria-label={shaded ? 'Restore' : 'Roll up'} style={box(right(R.MINIMIZE, dw))} onClick={() => window.retro.toggleShade()} />
        <button type="button" className="rk-chrome" aria-label="Close cassette rack" style={box(right(R.CLOSE, dw))} onClick={() => window.retro.closeWindow()} />
      </div>
    </div>
  )
}
