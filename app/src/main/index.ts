import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { ALBUM, PLAYLIST, POWER, RACK, WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Album, type Command } from '@shared/protocol'
import { SHADE } from '@shared/shade'
import { clampInto, expandedAt, shadedBounds } from './shade'
import { fitGroup, inferDocks, layout, matchHeight, overlaps, snap, subtree, type Docks, type Rect } from './dock'
import { x11Relaunch } from './platform'
import { isValidCommand } from './ndjson'
import { contextMenu, setHidden } from './contextMenu'
import { loadSettings, saveSettings, type WindowState } from './settings'
import { AWAITING, optionsCommands, optionsStep } from './options'
import { nextSession, restoreCommands, restoreStep, type Session } from './session'
import { defaultPlayerSize, proportional, sizeLimits } from './windowSize'
import { Sidecar } from './sidecar'
// Bundled into out/ by electron-vite; packaged builds also get it as the .icns/.ico via electron-builder.
import icon from '../../build/icon.png?asset'

let win: BrowserWindow | null = null
let quitting = false
// "Satellite" windows (playlist, album art, cassette rack, power deck): frameless, open with the player, hidden instead of closed, hidden while the player is minimized.
interface Satellite {
  hash: 'playlist' | 'album' | 'rack' | 'power' // also its id in the dock graph (the player is 'player')
  title: string
  aspect: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  key: 'playlistWindow' | 'albumWindow' | 'rackWindow' | 'powerWindow'
  win: BrowserWindow | null
  wanted: boolean
  shaded: boolean // rolled up to its top bar
  expanded: Rect | null // bounds to restore on unshade
  timer?: NodeJS.Timeout
}
const PL_ASPECT = PLAYLIST.WINDOW.w / PLAYLIST.WINDOW.h
const AL_ASPECT = ALBUM.WINDOW.w / ALBUM.WINDOW.h
const RK_ASPECT = RACK.WINDOW.w / RACK.WINDOW.h
const PD_ASPECT = POWER.WINDOW.w / POWER.WINDOW.h
const playlist: Satellite = {
  hash: 'playlist', title: 'Cassette Player: Playlist', aspect: PL_ASPECT, ...sizeLimits(PL_ASPECT), key: 'playlistWindow', win: null, wanted: false, shaded: false, expanded: null
}
const album: Satellite = {
  hash: 'album', title: 'Cassette Player: Album', aspect: AL_ASPECT, ...sizeLimits(AL_ASPECT), key: 'albumWindow', win: null, wanted: false, shaded: false, expanded: null
}
const rack: Satellite = {
  hash: 'rack', title: 'Cassette Player: Cassette Rack', aspect: RK_ASPECT, ...sizeLimits(RK_ASPECT), key: 'rackWindow', win: null, wanted: false, shaded: false, expanded: null
}
const power: Satellite = {
  hash: 'power', title: 'Cassette Player: Power Deck', aspect: PD_ASPECT, ...sizeLimits(PD_ASPECT), key: 'powerWindow', win: null, wanted: false, shaded: false, expanded: null
}
const satellites = [playlist, album, rack, power]
// Who is docked to whom (in memory; read back from the saved positions at startup). Any window can dock to any side
// of any other; docked windows follow their anchor, so everything docked to the player moves with it.
const DEFAULT_DOCKS: Docks = { playlist: { to: 'player', side: 'right', ratio: 0 }, album: { to: 'player', side: 'left', ratio: 0 }, rack: { to: 'player', side: 'top', ratio: 0 }, power: { to: 'playlist', side: 'right', ratio: 0 } }
let docks: Docks = { ...DEFAULT_DOCKS }
const live = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()
// Last session (track, album, position): kept from engine events, saved on every state change, every few seconds
// while playing and on quit, and restored at startup stopped at the saved position (Play resumes there).
const SESSION_SAVE_MS = 5000
let session: Session | undefined // read at whenReady: userData is set further down
let sessionAlbum: Album | null = null
let sessionSavedAt = 0
let restoreLeft = 0 // restore states still to come (restoreStep)
function saveSession(): void {
  if (!session) return
  saveSettings({ session })
  sessionSavedAt = Date.now()
}
// Options-save gate (see optionsStep): waits for a fresh engine's defaults, then skips the half-applied echoes.
let optionsSkip = AWAITING
const sidecar = new Sidecar(
  () => [win, ...satellites.map((s) => s.win)].filter(live),
  (evt) => {
    const o = optionsStep(optionsSkip, evt, loadSettings().options)
    optionsSkip = o.skip
    if (o.save) saveSettings({ options: o.save })
    if (o.sync) for (const c of optionsCommands(loadSettings().options)) sidecar.send(c)
    if (evt.type === 'playlist') sessionAlbum = evt.album
    restoreLeft = restoreStep(restoreLeft, evt)
    if (restoreLeft > 0) return
    const next = nextSession(session, sessionAlbum, evt)
    if (next === session) return
    session = next
    if (evt.type === 'state' || Date.now() - sessionSavedAt >= SESSION_SAVE_MS) saveSession()
  }
)
const devUrl = process.env.ELECTRON_RENDERER_URL

function fromAppWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return [win, ...satellites.map((s) => s.win)].some((w) => live(w) && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame)
}

const ASPECT = WINDOW.width / WINDOW.height
const PLAYER = sizeLimits(ASPECT) // every window has the same height range (windowSize.ts)

// Sizes below are content sizes (the window is frameless, so content == window).
// Returns the saved bounds fitted to a visible display, or null if there are none or they are off-screen.
function fitSaved(saved: WindowState | undefined, aspect: number, { minWidth, maxWidth: largest }: { minWidth: number; maxWidth: number }): { x: number; y: number; width: number; height: number } | null {
  if (!saved) return null
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const ow = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x)
    const oh = Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y)
    return ow >= 100 && oh >= 50
  })
  if (!visible) return null
  // Clamp to the work area of the display the window lands on, keeping the aspect ratio:
  // a corrupt or hand-edited settings.json must not open a window larger than the screen.
  const a = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }).workArea
  const maxWidth = Math.max(minWidth, Math.min(largest, a.width, Math.floor(a.height * aspect)))
  const width = Math.min(maxWidth, Math.max(minWidth, Math.round(saved.width)))
  return { x: Math.round(saved.x), y: Math.round(saved.y), width, height: Math.round(width / aspect) }
}

function initialBounds(): { x?: number; y?: number; width: number; height: number } {
  const fitted = fitSaved(loadSettings().window, ASPECT, PLAYER)
  if (fitted) return fitted
  const area = screen.getPrimaryDisplay().workAreaSize
  return defaultPlayerSize(area, ASPECT, PLAYER.minWidth)
}

// A side window reopens at its saved bounds (if still on screen); the first time it takes the player's height.
// A docked window is placed by its dock when it is shown, so its start position does not matter much.
function satelliteBounds(s: Satellite): { x?: number; y?: number; width: number; height: number } {
  const fitted = fitSaved(loadSettings()[s.key], s.aspect, s)
  if (fitted) return fitted
  const size = matchHeight(live(win) ? win.getBounds().height : PLAYER.minHeight, s.aspect, s.minWidth)
  if (!live(win)) return size
  const p = win.getBounds()
  return { ...size, x: p.x + p.width, y: p.y }
}

// Read the docks back from the saved positions (a window saved flush against the group is docked again).
function restoreDocks(): void {
  const st = loadSettings()
  if (!st.window) return
  const saved: Record<string, Rect> = { player: st.window }
  for (const s of satellites) if (st[s.key]) saved[s.hash] = st[s.key]!
  const found = inferDocks(saved, ['player', ...satellites.map((s) => s.hash)])
  for (const s of satellites) if (saved[s.hash]) docks[s.hash] = found[s.hash]
}

// Shared by the debounced save and the immediate save before the player destroys the window.
function persistSatellite(s: Satellite): void {
  const w = s.win
  if (!live(w) || w.isMinimized()) return
  const nb = w.getNormalBounds()
  // While shaded, save the full size so a restart does not open a stub.
  const { x, y, width, height } = s.shaded && s.expanded ? expandedAt(nb, s.expanded) : nb
  saveSettings({ [s.key]: { x, y, width, height } })
}

// Bounds changes we make ourselves: their move/resize events must not be read as user drags (feedback loop).
// Linux delivers move/resize asynchronously (a slow X server can take several hundred ms), some X11 window managers apply a new size before the new
// position, and several changes can be in flight at once (a resize syncs on every step). So an event is ours while
// the window sits at a position we asked for or left in the last second; any other position is a user drag, even
// right after our own change (a drag can go on after a mid-drag snap).
const expected = new Map<BrowserWindow, Array<Rect & { until: number }>>()
function programmatic(w: BrowserWindow, r: Rect): void {
  const b = w.getBounds()
  const until = Date.now() + 1000
  const keep = (expected.get(w) ?? []).filter((p) => p.until >= until - 1000)
  // Old and new rects, and the mixes a two-step X11 configure passes through.
  const mix = [b, r, { ...b, width: r.width, height: r.height }, { ...r, width: b.width, height: b.height }]
  expected.set(w, [...keep, ...mix.map((m) => ({ ...m, until }))])
  // A pure move uses setPosition: on Windows at fractional display scaling, setBounds can drift the size by a pixel.
  if (b.width === r.width && b.height === r.height) w.setPosition(r.x, r.y)
  else w.setBounds(r)
}
// `sized`: a resize is ours only if the size matches too (a user resize from the far corner keeps the position).
function isOwn(w: BrowserWindow, sized = false): boolean {
  const now = Date.now()
  const b = w.getBounds()
  const near = (p: number, q: number): boolean => Math.abs(p - q) <= 1
  return (expected.get(w) ?? []).some(
    (p) => p.until >= now && near(b.x, p.x) && near(b.y, p.y) && (!sized || (near(b.width, p.width) && near(b.height, p.height)))
  )
}
// The last user move or resize: another window's event right after it is a consequence (a window manager keeping a
// side window on screen moves it elsewhere than we asked), never a drag of that window.
let userChange = { id: '', at: 0 }
const userChanged = (id: string): void => void (userChange = { id, at: Date.now() })
const busyElsewhere = (id: string): boolean => userChange.id !== id && Date.now() - userChange.at < 300
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

// GTK ignores size changes on a non-resizable window (a shaded one): lift the lock around the change, then leave the
// window `resizable`. X11 pins a fixed window's minimum size to its size, so a new minimum (`min`) is set inside the lift too.
function resizeFixed(w: BrowserWindow, r: Rect, min?: [number, number], resizable = w.isResizable()): void {
  w.setResizable(true)
  if (min) w.setMinimumSize(...min)
  programmatic(w, r)
  w.setResizable(resizable)
}
function setRect(w: BrowserWindow, r: Rect): void {
  const b = w.getBounds()
  if (sameRect(r, b)) return
  if (r.width === b.width && r.height === b.height) programmatic(w, r)
  else resizeFixed(w, r)
}

// Bounds of the player and the visible side windows (plus `extra`, about to be shown), by dock id. `over` replaces
// bounds we just set: Linux applies them asynchronously, so getBounds() can still report the old ones.
function rectsNow(over: Record<string, Rect> = {}, extra?: Satellite): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  if (live(win)) out.player = win.getBounds()
  for (const s of satellites) if (live(s.win) && (s.win.isVisible() || s === extra)) out[s.hash] = s.win.getBounds()
  for (const [id, r] of Object.entries(over)) if (out[id]) out[id] = r
  return out
}

// Bring every window to where it belongs: docked windows are placed against their anchor, each keeping its own size.
// Returns the bounds it laid out (empty while the player is minimized).
function sync(over: Record<string, Rect> = {}, extra?: Satellite): Record<string, Rect> {
  if (!live(win) || win.isMinimized()) return {} // a minimized player's bounds can be bogus
  const out = layout(rectsNow(over, extra), docks)
  for (const s of satellites) if (live(s.win) && out[s.hash]) setRect(s.win, out[s.hash])
  parentDocked()
  return out
}

// macOS moves a window only when the drag ends (no move events during it), so the player's docked windows are made
// its child windows there: the window server then carries them along live. Other platforms follow via sync().
function parentDocked(): void {
  if (process.platform !== 'darwin' || !live(win)) return
  const group = subtree(docks, 'player')
  for (const s of satellites) {
    if (!live(s.win)) continue
    const want = group.has(s.hash) ? win : null
    if (s.win.getParentWindow() !== want) s.win.setParentWindow(want)
  }
}

// A window was dropped after a user drag: snap it to the nearest edge of a window outside its own group (the group
// comes along), then read the docks from the new geometry. Hidden windows keep their docks.
function settle(id: string): void {
  if (!live(win) || win.isMinimized()) return
  const rects = rectsNow(keepProportion(id))
  const me = rects[id]
  if (!me) return
  const group = subtree(docks, id)
  const to = snap(me, Object.fromEntries(Object.entries(rects).filter(([k]) => !group.has(k))))
  const w = id === 'player' ? win : (satellites.find((s) => s.hash === id)?.win ?? null)
  if (!sameRect(to, me) && live(w)) programmatic(w, to)
  // The dropped group's own docks are kept until the new ones are read, so it moves as one.
  const placed = sync({ [id]: to })
  const next = inferDocks(placed, ['player', id, ...satellites.map((s) => s.hash)])
  for (const s of satellites) if (!placed[s.hash]) next[s.hash] = docks[s.hash]
  docks = next
  parentDocked()
  // A resize at the screen edge must not leave docked windows off screen (or clamped over the player). A drop is left
  // where the user put it: off screen is allowed where the OS allows it.
  if ((resizedSinceSettle && fitPlayerGroup(placed)) || resizeTarget.size) fitSoon()
  resizedSinceSettle = false
}
let resizedSinceSettle = false

// A user resize keeps the window's aspect and size limits. Windows and macOS enforce the aspect during the resize; an
// X11 window manager (KWin) may not, so the size is fixed when the resize ends. `resizeFrom` holds each window's bounds
// from before its current resize, which tells which edge the user moved.
const resizeFrom = new Map<string, Rect>()
const resizeTarget = new Map<string, Rect>() // fixes a window manager has not applied yet (the user still holds the window)
const windowOf = (id: string): BrowserWindow | null => (id === 'player' ? win : (satellites.find((s) => s.hash === id)?.win ?? null))
function keepProportion(id: string): Record<string, Rect> {
  const from = resizeFrom.get(id)
  resizeFrom.delete(id)
  const s = satellites.find((x) => x.hash === id)
  const w = windowOf(id)
  if (!from || !live(w) || s?.shaded) return {}
  const cur = w.getBounds()
  const want = proportional(cur, from, s ? s.aspect : ASPECT, s ?? PLAYER)
  if (Math.abs(want.width - cur.width) <= 1 && Math.abs(want.height - cur.height) <= 1) return {}
  programmatic(w, want)
  resizeTarget.set(id, want)
  return { [id]: want }
}
// A window manager ignores our move while the user still holds the window (a resize paused mid-way): try again
// until the group fits, or the user changes something.
let fitTimer: NodeJS.Timeout | undefined
function fitSoon(tries = 0): void {
  fitTimer = setTimeout(() => {
    for (const [id, want] of resizeTarget) {
      const w = windowOf(id)
      const b = live(w) ? w.getBounds() : want
      if (Math.abs(b.width - want.width) <= 1 && Math.abs(b.height - want.height) <= 1) resizeTarget.delete(id)
      else if (live(w)) programmatic(w, { ...b, width: want.width, height: want.height })
    }
    if ((fitPlayerGroup(sync()) || resizeTarget.size) && tries < 40) fitSoon(tries + 1)
    else resizeTarget.clear()
  }, 250)
}
const settleTimers = new Map<string, NodeJS.Timeout>()
function settleSoon(id: string): void {
  clearTimeout(fitTimer)
  resizeTarget.clear()
  clearTimeout(settleTimers.get(id))
  settleTimers.set(id, setTimeout(() => settle(id), 120))
}

// Show a wanted satellite on a real hidden -> shown transition only.
// Hide a side window. macOS drops a hidden child window from its parent while Electron still reports the parent, so
// parentDocked would never attach it again and activating the app would leave it behind: detach it first.
function hideSatellite(w: BrowserWindow): void {
  if (process.platform === 'darwin') w.setParentWindow(null)
  w.hide()
}

function showSatellite(s: Satellite): void {
  if (!live(s.win)) return
  if (s.win.isVisible()) return
  if (s.win.isMinimized()) s.win.restore()
  dockOnShow(s)
  s.win.showInactive()
  parentDocked() // macOS attaches child windows only once they are visible
}

// Place a satellite before it is shown: by its dock, or at its saved spot if detached (a detached one saved over the
// player is docked back to its default side). Then nudge the player's group onto the screen.
function dockOnShow(s: Satellite): void {
  if (!live(win) || !live(s.win)) return
  if (!docks[s.hash] && overlaps(win.getBounds(), s.win.getBounds())) docks[s.hash] = DEFAULT_DOCKS[s.hash]
  fitPlayerGroup(sync({}, s), s)
}

// Nudge the player's docked group onto the screen (laid out in `rects`), unless that would push the player onto a
// loose window. Returns whether it nudged.
function fitPlayerGroup(rects: Record<string, Rect>, extra?: Satellite): boolean {
  const p = rects.player
  if (!p || !live(win)) return false
  const group = subtree(docks, 'player')
  const { dx, dy } = fitGroup([...group].filter((id) => rects[id]).map((id) => rects[id]), screen.getDisplayMatching(p).workArea)
  if (!dx && !dy) return false
  const moved = { ...p, x: p.x + dx, y: p.y + dy }
  // Never nudge the player onto a detached window.
  if (Object.entries(rects).some(([id, r]) => !group.has(id) && overlaps(moved, r))) return false
  programmatic(win, moved) // the nudge
  sync({ player: moved }, extra)
  return true
}

function lastOpenDir(): string | undefined {
  const dir = loadSettings().lastOpenDir
  if (!dir) return undefined
  try {
    return existsSync(dir) && statSync(dir).isDirectory() ? dir : undefined
  } catch {
    return undefined
  }
}

function createWindow(): void {
  const b = initialBounds()
  const w = new BrowserWindow({
    ...(b.x !== undefined && b.y !== undefined ? { x: b.x, y: b.y } : { center: true }),
    width: b.width,
    height: b.height,
    ...PLAYER,
    useContentSize: true,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Cassette Player: Retro',
    icon,
    transparent: true, // rounded corners
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      // electron-vite emits the preload as CommonJS (.cjs): sandboxed renderers cannot load ESM preloads.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win = w
  w.setAspectRatio(ASPECT)
  w.once('ready-to-show', () => {
    w.show()
    restoreDocks()
    // Satellites open with the player, after it exists so they can dock beside it.
    const hidden = loadSettings().hiddenWindows ?? []
    for (const s of satellites) if (!hidden.includes(s.hash)) openSatellite(s)
  })

  // Minimizing the player hides the satellites too; restoring it shows the ones that were visible.
  const hiddenByMinimize = new Set<Satellite>()
  w.on('minimize', () => {
    for (const s of satellites) {
      if (live(s.win) && s.win.isVisible()) {
        hiddenByMinimize.add(s)
        hideSatellite(s.win)
      }
    }
  })
  w.on('restore', () => {
    sync() // resync heights and docks after the minimize
    for (const s of [...hiddenByMinimize]) if (s.wanted) showSatellite(s)
    hiddenByMinimize.clear()
  })

  // Remember the bounds; skip while minimized (bounds can be bogus then).
  const persist = (): void => {
    if (w.isDestroyed() || w.isMinimized()) return
    const { x, y, width, height } = w.getNormalBounds()
    saveSettings({ window: { x, y, width, height } })
  }
  let timer: NodeJS.Timeout | undefined
  const persistSoon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(persist, 500)
  }
  w.on('resize', persistSoon)
  w.on('move', persistSoon)
  // Docked windows follow the player live (our own nudges and snaps already synced); a user drag snaps when dropped.
  const followPlayer = (): void => {
    if (w.isMinimized() || isOwn(w, true)) return
    userChanged('player')
    sync()
  }
  w.on('resize', followPlayer)
  w.on('move', followPlayer)
  // A drop or the end of a resize snaps the player and fits its group onto the screen.
  let last = w.getBounds()
  const settlePlayer = (): void => {
    const b = w.getBounds()
    const prev = last
    last = b
    if (w.isMinimized() || isOwn(w, true)) return
    if (b.width !== prev.width || b.height !== prev.height) {
      resizedSinceSettle = true
      if (!resizeFrom.has('player')) resizeFrom.set('player', prev)
    }
    settleSoon('player')
  }
  w.on('move', settlePlayer)
  w.on('resize', settlePlayer)
  w.on('close', () => {
    clearTimeout(timer)
    persist()
    // A hidden satellite window must not keep the app alive; destroy() skips its close handler,
    // so save its bounds here instead of relying on the debounced save.
    for (const s of satellites) {
      if (!live(s.win)) continue
      clearTimeout(s.timer)
      persistSatellite(s)
      s.win.destroy()
    }
  })
  w.on('maximize', () => w.unmaximize()) // Linux ignores maximizable:false; nothing may maximize
  w.on('closed', () => {
    win = null
  })
  // A dead or reloading UI can't stop the tape-motor loop itself.
  const stopMotor = (): void => sidecar.send({ v: 1, type: 'stopSound', name: 'motor' })
  w.on('closed', stopMotor)
  w.webContents.on('render-process-gone', stopMotor)
  w.webContents.on('did-start-loading', stopMotor)
  w.webContents.on('did-finish-load', () => sidecar.resendState(w))
  // Right-click anywhere on the player: native menu to show or hide the other windows (a closed one only hides).
  const showMenu = (): void => {
    const items = satellites.map((s) => ({ label: s.title.replace('Cassette Player: ', ''), visible: live(s.win) && s.win.isVisible() }))
    const toggle = (i: number, show: boolean): void => {
      const s = satellites[i]
      if (show) openSatellite(s)
      else s.win?.close()
    }
    Menu.buildFromTemplate(contextMenu(items, toggle)).popup({ window: w })
  }
  w.webContents.on('context-menu', showMenu)
  // Windows: a right-click on a drag region opens the OS window menu instead of reaching the page.
  w.on('system-context-menu', (e) => {
    e.preventDefault()
    showMenu()
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  if (devUrl) void w.loadURL(devUrl)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
}

// Winamp-style shade: roll the window up to its top bar (still docked) or restore it.
function toggleShade(s: Satellite, from?: Rect): void {
  const w = s.win
  if (!live(w)) return
  const cur = from ?? w.getBounds()
  if (!s.shaded) {
    const { designW, barH } = SHADE[s.hash as keyof typeof SHADE]
    s.expanded = cur
    const r = shadedBounds(cur, designW, barH)
    s.shaded = true
    w.setAspectRatio(0) // the bar has its own shape; a shaded window is not resizable
    resizeFixed(w, r, [s.minWidth, r.height], false)
    // Windows keeps a window at least about 39 px tall, taller than a narrow window's bar: dock the height it really got.
    // (Linux applies bounds later, so getBounds() would still report the full size there.)
    const got = process.platform === 'win32' ? { ...r, height: Math.max(r.height, w.getBounds().height) } : r
    sync({ [s.hash]: got }) // windows docked below it move up
  } else {
    s.shaded = false
    const next = clampInto(expandedAt(cur, s.expanded ?? cur), screen.getDisplayMatching(cur).workArea)
    s.expanded = null
    resizeFixed(w, next, [s.minWidth, s.minHeight], true)
    w.setAspectRatio(s.aspect)
    sync({ [s.hash]: next }) // back to its size, docked
  }
  w.webContents.send(IPC.shaded, s.shaded)
}

function createSatellite(s: Satellite): BrowserWindow {
  const b = satelliteBounds(s)
  const w = new BrowserWindow({
    ...(b.x !== undefined && b.y !== undefined ? { x: b.x, y: b.y } : { center: true }),
    width: b.width,
    height: b.height,
    minWidth: s.minWidth,
    minHeight: s.minHeight,
    maxWidth: s.maxWidth,
    maxHeight: s.maxHeight,
    useContentSize: true,
    frame: false,
    resizable: true, // each window is resized on its own, keeping its design aspect
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // One taskbar icon for the app, and activating it brings every window forward: on Windows an owned window has no
    // taskbar button and rises with its owner; on Linux the taskbar folds a transient window into its main window
    // (KWin ignores skipTaskbar for XWayland windows). macOS has one Dock icon anyway, and a child window would move
    // with the player even when detached, so there only docked windows are children (parentDocked).
    ...(process.platform !== 'darwin' && live(win) && { parent: win }),
    title: s.title,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  s.win = w
  w.setAspectRatio(s.aspect)
  w.once('ready-to-show', () => {
    if (s.wanted) showSatellite(s)
  })
  w.on('maximize', () => w.unmaximize()) // Linux ignores maximizable:false; nothing may maximize
  // Satellites have no taskbar entry, so an OS-minimized one would be lost: restore and shade instead.
  w.on('minimize', () => {
    // Deferred: restoring inside the minimize event is unreliable.
    const normal = w.getNormalBounds() // restore() is async on Linux, so getBounds() right after could be stale
    // macOS can drop a restore that lands during its minimize animation, so retry until the window is back.
    let tries = 0
    const bringBack = (): void => {
      // Openbox minimizes a transient's whole group, player included: that is a minimize of the app, and restoring
      // the player brings this window back.
      if (!live(w) || !live(win) || win.isMinimized()) return
      if (w.isMinimized()) {
        // KWin under X11 leaves a restored window flagged minimized (isMinimized() stays true, size changes are
        // ignored); hiding and re-showing it clears that.
        if (process.platform === 'linux') {
          w.hide()
          w.showInactive()
        } else w.restore()
        if (++tries < 20) {
          setTimeout(bringBack, 150)
          return
        }
      }
      if (!s.shaded) toggleShade(s, normal)
    }
    setTimeout(bringBack, 0)
  })

  const persistSoon = (): void => {
    clearTimeout(s.timer)
    s.timer = setTimeout(() => persistSatellite(s), 500)
  }
  w.on('resize', persistSoon)
  w.on('move', persistSoon)
  // A user drag tears the window off its dock (windows docked to it come along); dropping it snaps and re-docks.
  // Still where its dock puts it: a late event of ours, or a size the OS clamped to the window's minimum. Only a
  // changed position is a drag.
  const atDock = (): boolean => {
    const rects = rectsNow()
    const at = layout(rects, docks)[s.hash]
    const cur = rects[s.hash]
    return !!docks[s.hash] && !!at && !!cur && Math.abs(at.x - cur.x) <= 1 && Math.abs(at.y - cur.y) <= 1
  }
  const ignored = (): boolean => isOwn(w) || busyElsewhere(s.hash) || !w.isVisible() || !live(win) || win.isMinimized() || atDock()
  let tearTimer: NodeJS.Timeout | undefined
  const dragged = (): void => {
    if (ignored()) return
    userChanged(s.hash)
    if (!docks[s.hash]) {
      sync() // windows docked to it come along
      settleSoon(s.hash)
      return
    }
    // X11 window managers can report a bogus position for a moment (0,0 while reparenting a window being shown):
    // tear a docked window off only if it is still away from its dock a moment later.
    tearTimer ??= setTimeout(() => {
      tearTimer = undefined
      if (ignored()) return
      docks[s.hash] = undefined
      sync()
      settleSoon(s.hash)
    }, 50)
  }
  // A user resize keeps the window docked: it is placed flush again (a drag on its docked edge grows it the other way),
  // windows docked to it follow, and it settles when the resize ends. A move without a size change is a drag.
  let last = { x: b.x ?? 0, y: b.y ?? 0, width: b.width, height: b.height }
  let resizedAt = 0
  const changed = (): void => {
    const now = w.getBounds()
    const prev = last
    last = now
    const resized = now.width !== prev.width || now.height !== prev.height
    if (resized) resizedAt = Date.now()
    // One change can come as a move and a resize event.
    if (Date.now() - resizedAt > 100) return dragged()
    if (isOwn(w, true) || busyElsewhere(s.hash) || s.shaded || !w.isVisible() || !live(win) || win.isMinimized()) return
    if (resized && !resizeFrom.has(s.hash)) resizeFrom.set(s.hash, prev)
    userChanged(s.hash)
    resizedSinceSettle = true
    sync()
    settleSoon(s.hash)
  }
  w.on('move', changed)
  w.on('resize', changed)
  // Closing only hides (and is remembered across launches): the window is reopened from the player's right-click menu
  // and keeps its state. Quitting must still close it.
  w.on('close', (e) => {
    clearTimeout(s.timer)
    persistSatellite(s)
    if (!quitting) {
      e.preventDefault()
      hideSatellite(w)
      saveSettings({ hiddenWindows: setHidden(loadSettings().hiddenWindows, s.hash, true) })
    }
  })
  w.on('closed', () => {
    s.win = null
    s.shaded = false
    s.expanded = null
  })
  w.webContents.on('did-finish-load', () => {
    sidecar.resendState(w)
    w.webContents.send(IPC.shaded, s.shaded)
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  if (devUrl) void w.loadURL(`${devUrl}#${s.hash}`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: s.hash })
  return w
}

// Create the satellite on first use (it shows itself on ready-to-show), or show it if it already exists.
function openSatellite(s: Satellite): void {
  s.wanted = true
  saveSettings({ hiddenWindows: setHidden(loadSettings().hiddenWindows, s.hash, false) })
  if (!live(s.win)) createSatellite(s)
  else showSatellite(s)
}

// Dev gets its own profile so a running dev session and an installed build don't share the
// single-instance lock (one would silently quit).
if (!app.isPackaged) app.setPath('userData', app.getPath('userData') + '-dev')

// Docking needs window positions, which native Wayland does not give apps: relaunch once on XWayland (platform.ts).
const relaunch = x11Relaunch(process.platform, process.env, process.argv, process.execPath)
if (relaunch) {
  app.relaunch(relaunch)
  app.exit(0)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  ipcMain.on(IPC.command, (e, cmd: unknown) => {
    if (!fromAppWindow(e)) return
    if (!isValidCommand(cmd)) {
      console.warn('[main] dropped invalid command', cmd)
      return
    }
    sidecar.send(cmd as Command)
  })
  ipcMain.handle(IPC.openDialog, async (e): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? win
    if (!fromAppWindow(e) || !parent) return null
    const r = await dialog.showOpenDialog(parent, {
      defaultPath: lastOpenDir(),
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: [...SUPPORTED_EXTENSIONS] }]
    })
    const file = r.canceled ? null : (r.filePaths[0] ?? null)
    if (file) saveSettings({ lastOpenDir: dirname(file) })
    return file
  })
  ipcMain.handle(IPC.openFolderDialog, async (e): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    if (!fromAppWindow(e) || !parent) return null
    const r = await dialog.showOpenDialog(parent, { defaultPath: lastOpenDir(), properties: ['openDirectory'] })
    const dir = r.canceled ? null : (r.filePaths[0] ?? null)
    if (dir) saveSettings({ lastOpenDir: dirname(dir) })
    return dir
  })
  ipcMain.on(IPC.showPlaylist, (e) => {
    if (!fromAppWindow(e)) return
    openSatellite(playlist)
    if (live(playlist.win)) playlist.win.focus()
  })
  ipcMain.on(IPC.toggleShade, (e) => {
    if (!fromAppWindow(e)) return
    const s = satellites.find((x) => live(x.win) && e.sender === x.win.webContents)
    if (s) toggleShade(s)
  })
  ipcMain.on(IPC.minimize, (e) => {
    if (fromAppWindow(e)) BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.quit, (e) => {
    if (fromAppWindow(e)) app.quit()
  })
  ipcMain.on(IPC.close, (e) => {
    if (fromAppWindow(e)) BrowserWindow.fromWebContents(e.sender)?.close()
  })

  // macOS: a Dock icon click with no window in front brings the player (and so every window) back.
  app.on('activate', () => {
    if (!live(win)) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.on('before-quit', () => {
    quitting = true
    if (restoreLeft === 0) saveSession() // mid-restore the file still holds the right spot
    sidecar.stop()
  })
  app.on('window-all-closed', () => app.quit())
  void app.whenReady().then(() => {
    createWindow()
    session = loadSettings().session
    sidecar.start()
    // A moved or deleted album or file is forgotten rather than reported as an error at every start.
    if (session && existsSync(session.album ?? session.path)) {
      const cmds = restoreCommands(session)
      restoreLeft = cmds.length
      for (const c of cmds) sidecar.send(c)
    } else if (session) {
      session = undefined
      saveSettings({ session }) // JSON drops the undefined key
    }
  })
}
