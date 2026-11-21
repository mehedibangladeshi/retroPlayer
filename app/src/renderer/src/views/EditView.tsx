import { useEffect, useRef, useState } from 'react'
import type { AlbumEditState } from '@shared/api'
import { CASSETTE_DESIGNS } from '@shared/cassettes'
import { SPINE_ASPECT } from '@shared/rack'
import { cassetteFiles } from './cassetteDesign'
import { backgroundPosition, initialForm, offsetFromDrag, toSave, type EditForm } from './editForm'
import './EditView.css'

const urls = import.meta.glob<string>('@assets/png/cassette-*.png', { query: '?url', import: 'default', eager: true })
const urlFor = (file: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith(`/${file}`))?.[1]

const COVER = 280 // cover preview edge, px
const STRIP_W = COVER * SPINE_ASPECT

export default function EditView() {
  const [state, setState] = useState<AlbumEditState | null>(null)
  const [form, setForm] = useState<EditForm | null>(null)
  const [picked, setPicked] = useState<string | null>(null) // data URL of a newly picked cover
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const coverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const apply = (s: AlbumEditState | null): void => {
      if (!s) return
      setState(s); setForm(initialForm(s)); setPicked(null); setError('')
    }
    let pushed = false // a retarget push is newer than the initial fetch
    void window.retro.getAlbumEdit().then((s) => { if (!pushed) apply(s) })
    const off = window.retro.onAlbumEdit((s) => { pushed = true; apply(s) })
    return () => { pushed = true; off() }
  }, [])

  if (!state || !form) return <div className="ed" />
  const set = (p: Partial<EditForm>): void => setForm({ ...form, ...p })
  const cover = picked ?? state.cover
  const ink = form.ink ?? '#f4f4f0'
  const text = form.text.trim() || state.defaultText

  const drag = (e: React.PointerEvent): void => {
    const box = coverRef.current!.getBoundingClientRect()
    set({ spineOffset: offsetFromDrag(e.clientX - box.left - STRIP_W / 2, COVER, STRIP_W) })
  }
  const pick = async (): Promise<void> => {
    try {
      const r = await window.retro.pickAlbumCover()
      if (r) { setPicked(r.dataUrl); set({ token: r.token }); setError('') }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    try { await window.retro.saveAlbumEdit(toSave(state, form)); window.retro.closeAlbumEdit() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  const spineBg = form.solid || !cover ? form.spineColor : `url("${cover}") ${backgroundPosition(form.spineOffset)} / auto 100% no-repeat`

  return (
    <div className="ed">
      <div className="ed-titlebar" />
      <span className="ed-title">Edit Album</span>
      <button type="button" className="ed-close" aria-label="Close" onClick={() => window.retro.closeAlbumEdit()}>×</button>

      <div className="ed-left">
        <div className="ed-label">Preview</div>
        <div className="ed-cover" ref={coverRef} style={{ width: COVER, height: COVER, background: cover ? `url("${cover}") center / cover` : '#c9c9c4' }}>
          {!cover && <span className="ed-nocover">{state.defaultText}</span>}
          <div
            className="ed-strip"
            style={{ width: STRIP_W, left: form.spineOffset * (COVER - STRIP_W) }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e) }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e) }}
          />
        </div>
        <div className="ed-move">← move →</div>
      </div>

      <div className="ed-spine" style={{ width: STRIP_W * 1.4, background: spineBg, color: ink }}>
        <span>{text}</span>
      </div>

      <div className="ed-right">
        <div className="ed-row">
          <button type="button" className="ed-pencil" aria-label="Change album cover" onClick={pick}>✎</button>
          <span>Change album cover</span>
        </div>
        {error && <div className="ed-error">{error}</div>}
        <label className="ed-row">
          <input type="checkbox" checked={form.solid} onChange={(e) => set({ solid: e.target.checked })} />
          <span>Solid spine colour</span>
          <Swatch value={form.spineColor} onChange={(v) => set({ spineColor: v, solid: true })} />
        </label>
        <div className="ed-row">
          <span className="ed-gap" />
          <span>Spine font colour</span>
          <Swatch value={ink} onChange={(v) => set({ ink: v })} />
          <button type="button" className="ed-small" disabled={!form.ink} onClick={() => set({ ink: null })}>Auto</button>
        </div>
        <div className="ed-row">
          <span className="ed-gap" />
          <span>Spine text</span>
          <input className="ed-text" type="text" maxLength={200} placeholder={state.defaultText} value={form.text} onChange={(e) => set({ text: e.target.value })} />
        </div>
        <div className="ed-label ed-designs-label">Cassette design</div>
        <div className="ed-designs">
          {CASSETTE_DESIGNS.map((d) => {
            const f = cassetteFiles(d)
            return (
              <button type="button" key={d} aria-label={d} className={`ed-design${form.design === d ? ' sel' : ''}`} onClick={() => set({ design: d })}>
                {[f.base, f.mid, f.reel].map((p) => <img key={p} src={urlFor(p.replace('png/', ''))} alt="" draggable={false} />)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="ed-actions">
        <button type="button" className="ed-btn" disabled={busy} onClick={() => window.retro.closeAlbumEdit()}>Cancel</button>
        <button type="button" className="ed-btn" disabled={busy} onClick={save}>Save</button>
      </div>
    </div>
  )
}

/** Round swatch over a hidden native colour input. */
function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="ed-swatch" style={{ background: value }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}
