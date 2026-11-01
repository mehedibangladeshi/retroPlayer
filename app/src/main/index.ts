import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { PLAYLIST, WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Command, type EngineEvent } from '@shared/protocol'
import { fitAll, follow, gripResize, isAttached, overlaps, placeSide, snapTo, type Side } from './dock'
import { isValidCommand } from './ndjson'
import { loadSettings, saveSettings, type WindowState } from './settings'
import { Sidecar } from './sidecar'

let win: BrowserWindow | null = null
let quitting = false
// "Satellite" windows (playlist, album art): frameless, hidden instead of closed, shown while the engine has content for them.
interface Satellite {
  hash: string
  title: string
  aspect: number
  minWidth: number
  minHeight: number
  key: 'playlistWindow' | 'albumWindow'
  side: Side
  attached: boolean // docked flush to the player (in memory only)
  dockTimer?: NodeJS.Timeout
  // Default bounds beside the player (p = player content bounds, a = its display work area), before clamping.
  place: (p: Rect, a: Rect) => Rect
  win: BrowserWindow | null
  wanted: boolean
  timer?: NodeJS.Timeout
}
type Rect = { x: number; y: number; width: number; height: number }
const PL_ASPECT = PLAYLIST.WINDOW.w / PLAYLIST.WINDOW.h
const PL_MIN_WIDTH = 320
const playlist: Satellite = {
  hash: 'playlist', title: 'Cassette Player: Playlist', aspect: PL_ASPECT, minWidth: PL_MIN_WIDTH, minHeight: 322, key: 'playlistWindow', side: 'right', attached: true, win: null, wanted: false,
  // Flush against the player's right edge, same height.
  place: (p, a) => {
    const height = Math.min(p.height, a.height)
    return { x: p.x + p.width, y: p.y, width: Math.max(PL_MIN_WIDTH, Math.round(height * PL_ASPECT)), height }
  }
}
const album: Satellite = {
  hash: 'album', title: 'Cassette Player: Album', aspect: 1, minWidth: 240, minHeight: 240, key: 'albumWindow', side: 'left', attached: true, win: null, wanted: false,
  // Square, flush against the player's left edge.
  place: (p, a) => {
    const size = Math.max(240, Math.min(p.height, a.height, a.width))
    return { x: p.x - size, y: p.y, width: size, height: size }
  }
}
const satellites = [playlist, album]
const live = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()
const sidecar = new Sidecar(() => [win, playlist.win, album.win].filter(live), onEngineEvent)
const devUrl = process.env.ELECTRON_RENDERER_URL

function fromAppWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return [win, playlist.win, album.win].some((w) => live(w) && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame)
}

const ASPECT = WINDOW.width / WINDOW.height
const MIN_WIDTH = 575
const MIN_HEIGHT = 462

// Sizes below are content sizes (the window is frameless, so content == window).
// Returns the saved bounds fitted to a visible display, or null if there are none or they are off-screen.
function fitSaved(saved: WindowState | undefined, aspect: number, minWidth: number): { x: number; y: number; width: number; height: number; fullScreen: boolean } | null {
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
  const maxWidth = Math.max(minWidth, Math.min(a.width, Math.floor(a.height * aspect)))
  const width = Math.min(maxWidth, Math.max(minWidth, Math.round(saved.width)))
  return { x: Math.round(saved.x), y: Math.round(saved.y), width, height: Math.round(width / aspect), fullScreen: saved.fullScreen }
}

function initialBounds(): { x?: number; y?: number; width: number; height: number; fullScreen: boolean } {
  const fitted = fitSaved(loadSettings().window, ASPECT, MIN_WIDTH)
  if (fitted) return fitted
  const area = screen.getPrimaryDisplay().workAreaSize
  let width = Math.round(0.55 * area.width)
  if (width / ASPECT > 0.8 * area.height) width = Math.round(0.8 * area.height * ASPECT)
  width = Math.max(MIN_WIDTH, width)
  return { width, height: Math.round(width / ASPECT), fullScreen: false }
}

function satelliteBounds(s: Satellite): { x?: number; y?: number; width: number; height: number } {
  const fitted = fitSaved(loadSettings()[s.key], s.aspect, s.minWidth)
  if (fitted) return fitted
  if (!live(win)) return { width: s.minWidth * 2, height: Math.round((s.minWidth * 2) / s.aspect) }
  const p = win.getContentBounds()
  const a = screen.getDisplayMatching(p).workArea
  const r = s.place(p, a)
  // Keep it inside the player's display.
  return { ...r, x: Math.max(a.x, Math.min(r.x, a.x + a.width - r.width)), y: Math.max(a.y, Math.min(r.y, a.y + a.height - r.height)) }
}

// Shared by the debounced save and the immediate save before the player destroys the window.
function persistSatellite(s: Satellite): void {
  const w = s.win
  if (!live(w) || w.isMinimized()) return
  const { x, y, width, height } = w.getNormalBounds()
  saveSettings({ [s.key]: { x, y, width, height, fullScreen: false } })
}

// Bounds changes we make ourselves: their move/resize events must not be read as user drags (feedback loop).
// Linux delivers move/resize asynchronously, so instead of a tick we remember the rect we asked for (250 ms cap).
const expected = new Map<BrowserWindow, { r: Rect; until: number }>()
function programmatic(w: BrowserWindow, r: Rect): void {
  expected.set(w, { r, until: Date.now() + 250 })
  w.setBounds(r)
}
function isOwn(w: BrowserWindow): boolean {
  const e = expected.get(w)
  if (!e || Date.now() > e.until) return false
  const b = w.getBounds()
  return Math.abs(b.x - e.r.x) <= 1 && Math.abs(b.y - e.r.y) <= 1 && Math.abs(b.width - e.r.width) <= 1 && Math.abs(b.height - e.r.height) <= 1
}
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
let prevPlayer: Rect | null = null
const attachedVisible = (): Satellite[] => satellites.filter((s) => live(s.win) && s.win.isVisible() && s.attached)

// Satellites that must show once the full-screen player returns to a window.
const deferred = new Set<Satellite>()
// Show a wanted satellite on a real hidden -> shown transition only; never over the full-screen player.
function showSatellite(s: Satellite): void {
  if (!live(s.win)) return
  if (live(win) && win.isFullScreen()) {
    deferred.add(s)
    return
  }
  if (s.win.isVisible()) return
  if (s.win.isMinimized()) s.win.restore()
  dockOnShow(s)
  s.win.showInactive()
}

// Place a satellite beside the player when it is shown: attached (default), never saved over the player, or with no saved spot.
function dockOnShow(s: Satellite): void {
  if (!live(win) || !live(s.win)) return
  const player = win.getBounds()
  const mine = s.win.getBounds()
  if (loadSettings()[s.key] && !s.attached && !overlaps(player, mine)) return
  const sides: Partial<Record<Side, Rect>> = { [s.side]: mine }
  for (const o of attachedVisible()) if (o !== s && live(o.win)) sides[o.side] = o.win.getBounds()
  let fit = fitAll(player, sides, screen.getDisplayMatching(player).workArea)
  // A visible detached satellite is not part of fitAll: do not nudge the player onto it.
  const detached = satellites.flatMap((o) => (o !== s && live(o.win) && o.win.isVisible() && !o.attached ? [o.win.getBounds()] : []))
  if (!sameRect(fit.player, player) && detached.some((d) => overlaps(fit.player, d))) {
    const keep: typeof fit = { player }
    for (const side of ['left', 'right'] as const) {
      const r = sides[side]
      if (r) keep[side] = snapTo(player, r, side)
    }
    fit = keep
  }
  if (!sameRect(fit.player, player)) programmatic(win, fit.player) // the nudge
  prevPlayer = fit.player
  for (const o of satellites) {
    const r = fit[o.side]
    if (r && live(o.win) && (o === s || sides[o.side])) programmatic(o.win, r)
  }
  if (live(s.win) && overlaps(fit.player, s.win.getBounds())) programmatic(s.win, placeSide(fit.player, s.win.getBounds(), s.side))
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
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    useContentSize: true,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: true,
    title: 'Cassette Player: Retro',
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
  prevPlayer = w.getBounds()
  w.once('ready-to-show', () => {
    w.show()
    if (b.fullScreen) w.setFullScreen(true)
  })

  // Remember the non-fullscreen bounds; skip while minimized (bounds can be bogus then).
  const persist = (): void => {
    if (w.isDestroyed() || w.isMinimized()) return
    // Some platforms report the full-screen rect as "normal" bounds: keep the last windowed ones then.
    const prev = loadSettings().window
    const { x, y, width, height } = w.isFullScreen() && prev ? prev : w.getNormalBounds()
    saveSettings({ window: { x, y, width, height, fullScreen: w.isFullScreen() } })
  }
  let timer: NodeJS.Timeout | undefined
  const persistSoon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(persist, 500)
  }
  w.on('resize', persistSoon)
  w.on('move', persistSoon)
  // Attached satellites follow the player (our own nudges are handled in dockOnShow).
  const followPlayer = (): void => {
    if (w.isFullScreen()) return // keep prevPlayer at the windowed bounds; leave-full-screen re-docks
    const next = w.getBounds()
    if (!isOwn(w) && prevPlayer) {
      for (const s of attachedVisible()) if (live(s.win)) programmatic(s.win, follow(s.win.getBounds(), prevPlayer, next, s.side))
    }
    prevPlayer = next
  }
  w.on('resize', followPlayer)
  w.on('move', followPlayer)
  // Satellites stay hidden while the player is full screen.
  w.on('enter-full-screen', () => {
    for (const s of satellites) {
      if (live(s.win) && s.win.isVisible()) {
        deferred.add(s)
        s.win.hide()
      }
    }
  })
  w.on('leave-full-screen', () => {
    for (const s of attachedVisible()) dockOnShow(s)
    for (const s of [...deferred]) if (s.wanted) showSatellite(s)
    deferred.clear()
    prevPlayer = w.getBounds()
  })
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
  w.on('maximize', () => w.unmaximize()) // Linux ignores maximizable:false; double-click must never maximize
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11' || (process.platform === 'darwin' && input.control && input.meta && input.key.toLowerCase() === 'f')) {
      w.setFullScreen(!w.isFullScreen())
      e.preventDefault()
    } else if (input.key === 'Escape' && w.isFullScreen()) {
      w.setFullScreen(false)
      e.preventDefault()
    }
  })
  w.on('closed', () => {
    win = null
  })
  w.webContents.on('did-finish-load', () => sidecar.resendState(w))
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  if (devUrl) void w.loadURL(devUrl)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
}

function createSatellite(s: Satellite): BrowserWindow {
  const b = satelliteBounds(s)
  const w = new BrowserWindow({
    ...(b.x !== undefined && b.y !== undefined ? { x: b.x, y: b.y } : { center: true }),
    width: b.width,
    height: b.height,
    minWidth: s.minWidth,
    minHeight: s.minHeight,
    useContentSize: true,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
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
  w.on('maximize', () => w.unmaximize())

  const persistSoon = (): void => {
    clearTimeout(s.timer)
    s.timer = setTimeout(() => persistSatellite(s), 500)
  }
  w.on('resize', persistSoon)
  w.on('move', persistSoon)
  // A user drag/resize decides whether the window is attached; attached ones snap flush.
  const settle = (): void => {
    if (isOwn(w)) return
    clearTimeout(s.dockTimer)
    s.dockTimer = setTimeout(() => {
      if (!live(win) || !live(w)) return
      const p = win.getBounds()
      const r = w.getBounds()
      s.attached = isAttached(p, r, s.side)
      const flush = snapTo(p, r, s.side)
      if (s.attached && !sameRect(flush, r)) programmatic(w, flush)
    }, 120)
  }
  w.on('move', settle)
  w.on('resize', settle)
  // Closing only hides: the window is reopened from the player and keeps its state. Quitting must still close it.
  w.on('close', (e) => {
    clearTimeout(s.timer)
    persistSatellite(s)
    if (!quitting) {
      e.preventDefault()
      w.hide()
    }
  })
  w.on('closed', () => {
    s.win = null
  })
  w.webContents.on('did-finish-load', () => sidecar.resendState(w))
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  if (devUrl) void w.loadURL(`${devUrl}#${s.hash}`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: s.hash })
  return w
}

function setSatelliteWanted(s: Satellite, on: boolean): void {
  s.wanted = on
  if (on) {
    // Satellites are only created here, driven by engine playlist/artwork events: never at launch.
    if (!live(s.win)) createSatellite(s) // shows itself on ready-to-show
    else {
      showSatellite(s)
    }
  } else {
    deferred.delete(s)
    if (live(s.win)) s.win.hide()
  }
}

function onEngineEvent(evt: EngineEvent): void {
  if (evt.type === 'playlist') setSatelliteWanted(playlist, evt.album !== null)
  else if (evt.type === 'artwork') setSatelliteWanted(album, evt.cover !== null)
}

// Dev gets its own profile so a running dev session and an installed build don't share the
// single-instance lock (one would silently quit).
if (!app.isPackaged) app.setPath('userData', app.getPath('userData') + '-dev')

if (!app.requestSingleInstanceLock()) {
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
    if (!fromAppWindow(e) || !win) return null
    const r = await dialog.showOpenDialog(win, {
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
    if (!fromAppWindow(e) || !live(playlist.win)) return
    if (playlist.win.isMinimized()) playlist.win.restore()
    playlist.win.show()
    playlist.win.focus()
  })
  ipcMain.on(IPC.minimize, (e) => {
    if (fromAppWindow(e)) BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.toggleFullScreen, (e) => {
    if (win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.on(IPC.resizeWindow, (e, width: unknown, height: unknown) => {
    if (!fromAppWindow(e) || !live(win) || typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) return
    const s = satellites.find((x) => live(x.win) && e.sender === x.win.webContents)
    if (!s || !live(s.win)) return
    const cur = s.win.getBounds()
    let next = gripResize(cur, width - cur.width, height - cur.height, s.aspect, s.minWidth, s.minHeight)
    const a = screen.getDisplayMatching(win.getBounds()).workArea
    const maxW = Math.max(s.minWidth, Math.floor(Math.min(a.width, a.height * s.aspect)))
    if (next.width > maxW) next = { ...next, width: maxW, height: Math.round(maxW / s.aspect) }
    if (s.attached) next = snapTo(win.getBounds(), next, s.side) // stay flush
    programmatic(s.win, next)
  })
  ipcMain.on(IPC.close, (e) => {
    if (fromAppWindow(e)) BrowserWindow.fromWebContents(e.sender)?.close()
  })

  app.on('before-quit', () => {
    quitting = true
    sidecar.stop()
  })
  app.on('window-all-closed', () => app.quit())
  void app.whenReady().then(() => {
    createWindow()
    sidecar.start()
  })
}
