import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { ALBUM, PLAYLIST, WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Command } from '@shared/protocol'
import { SHADE } from '@shared/shade'
import { clampInto, expandedAt, shadedBounds } from './shade'
import { fitAll, follow, isAttached, matchHeight, overlaps, placeSide, snapTo, type Side } from './dock'
import { isValidCommand } from './ndjson'
import { loadSettings, saveSettings, type WindowState } from './settings'
import { defaultPlayerSize } from './windowSize'
import { Sidecar } from './sidecar'
// Bundled into out/ by electron-vite; packaged builds also get it as the .icns/.ico via electron-builder.
import icon from '../../build/icon.png?asset'

let win: BrowserWindow | null = null
let quitting = false
// "Satellite" windows (playlist, album art): frameless, open with the player, hidden instead of closed, hidden while the player is minimized.
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
  // Flush x beside the player (p = player bounds) for a window of the given width.
  placeX: (p: Rect, width: number) => number
  win: BrowserWindow | null
  wanted: boolean
  shaded: boolean // rolled up to its top bar
  expanded: Rect | null // bounds to restore on unshade
  timer?: NodeJS.Timeout
}
type Rect = { x: number; y: number; width: number; height: number }
const PL_ASPECT = PLAYLIST.WINDOW.w / PLAYLIST.WINDOW.h
const PL_MIN_WIDTH = 320
const playlist: Satellite = {
  hash: 'playlist', title: 'Cassette Player: Playlist', aspect: PL_ASPECT, minWidth: PL_MIN_WIDTH, minHeight: 322, key: 'playlistWindow', side: 'right', attached: true, win: null, wanted: false, shaded: false, expanded: null,
  placeX: (p) => p.x + p.width // flush against the player's right edge
}
const album: Satellite = {
  hash: 'album', title: 'Cassette Player: Album', aspect: ALBUM.WINDOW.w / ALBUM.WINDOW.h, minWidth: 240, minHeight: 240, key: 'albumWindow', side: 'left', attached: true, win: null, wanted: false, shaded: false, expanded: null,
  placeX: (p, width) => p.x - width // flush against the player's left edge
}
const satellites = [playlist, album]
const live = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()
const sidecar = new Sidecar(() => [win, playlist.win, album.win].filter(live))
const devUrl = process.env.ELECTRON_RENDERER_URL

function fromAppWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return [win, playlist.win, album.win].some((w) => live(w) && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame)
}

const ASPECT = WINDOW.width / WINDOW.height
const MIN_WIDTH = 384
const MIN_HEIGHT = 308

// Sizes below are content sizes (the window is frameless, so content == window).
// Returns the saved bounds fitted to a visible display, or null if there are none or they are off-screen.
function fitSaved(saved: WindowState | undefined, aspect: number, minWidth: number): { x: number; y: number; width: number; height: number } | null {
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
  return { x: Math.round(saved.x), y: Math.round(saved.y), width, height: Math.round(width / aspect) }
}

function initialBounds(): { x?: number; y?: number; width: number; height: number } {
  const fitted = fitSaved(loadSettings().window, ASPECT, MIN_WIDTH)
  if (fitted) return fitted
  const area = screen.getPrimaryDisplay().workAreaSize
  return defaultPlayerSize(area, ASPECT, MIN_WIDTH)
}

// Side windows always take the player's height; only a saved position is reused (and only if still on screen).
function satelliteBounds(s: Satellite): { x?: number; y?: number; width: number; height: number } {
  const size = matchHeight(live(win) ? win.getBounds().height : MIN_HEIGHT, s.aspect, s.minWidth)
  const fitted = fitSaved(loadSettings()[s.key], s.aspect, s.minWidth)
  if (fitted) return { x: fitted.x, y: fitted.y, ...size }
  if (!live(win)) return size
  const p = win.getBounds()
  const a = screen.getDisplayMatching(p).workArea
  return { ...size, x: Math.max(a.x, Math.min(s.placeX(p, size.width), a.x + a.width - size.width)), y: Math.max(a.y, Math.min(p.y, a.y + a.height - size.height)) }
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

// Side windows are not user-resizable, and GTK ignores size changes on a fixed window: lift the lock around the change.
function resizeFixed(w: BrowserWindow, r: Rect): void {
  w.setResizable(true)
  programmatic(w, r)
  w.setResizable(false)
}

// Give a side window the player's height (and the width that goes with it), docked flush and vertically on screen.
// base = where it is going to be (default: where it is). Shaded windows keep their bar and only update the size they unroll to.
function matchPlayer(s: Satellite, base?: Rect): void {
  const w = s.win
  if (!live(win) || !live(w) || win.isMinimized()) return // a minimized player's bounds can be bogus
  const cur = base ?? w.getBounds()
  const p = win.getBounds()
  const size = matchHeight(p.height, s.aspect, s.minWidth)
  let next = cur
  if (s.shaded) {
    if (s.expanded) s.expanded = { ...s.expanded, ...size }
  } else {
    next = { ...cur, ...size }
    if (s.attached) next = snapTo(p, next, s.side)
    const a = screen.getDisplayMatching(p).workArea
    next.y = Math.max(a.y, Math.min(next.y, a.y + a.height - next.height))
  }
  if (!sameRect(next, w.getBounds())) resizeFixed(w, next)
}
const attachedVisible = (): Satellite[] => satellites.filter((s) => live(s.win) && s.win.isVisible() && s.attached)

// Show a wanted satellite on a real hidden -> shown transition only.
function showSatellite(s: Satellite): void {
  if (!live(s.win)) return
  if (s.win.isVisible()) return
  if (s.win.isMinimized()) s.win.restore()
  matchPlayer(s) // the player may have been resized while it was hidden
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
  prevPlayer = w.getBounds()
  w.once('ready-to-show', () => {
    w.show()
    // Satellites open with the player, after it exists so they can dock beside it.
    for (const s of satellites) openSatellite(s)
  })

  // Minimizing the player hides the satellites too; restoring it shows the ones that were visible.
  const hiddenByMinimize = new Set<Satellite>()
  w.on('minimize', () => {
    for (const s of satellites) {
      if (live(s.win) && s.win.isVisible()) {
        hiddenByMinimize.add(s)
        s.win.hide()
      }
    }
  })
  w.on('restore', () => {
    prevPlayer = w.getBounds()
    for (const s of satellites) matchPlayer(s) // resync heights after the minimize
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
  // Attached satellites follow the player (our own nudges are handled in dockOnShow); every satellite keeps the player's height.
  const followPlayer = (): void => {
    if (w.isMinimized()) return
    const next = w.getBounds()
    for (const s of satellites) {
      if (!live(s.win)) continue
      const moved = !isOwn(w) && prevPlayer && s.attached && s.win.isVisible()
      matchPlayer(s, moved ? follow(s.win.getBounds(), prevPlayer!, next, s.side) : undefined)
    }
    prevPlayer = next
  }
  w.on('resize', followPlayer)
  w.on('move', followPlayer)
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
    w.setMinimumSize(s.minWidth, r.height)
    resizeFixed(w, r)
  } else {
    s.shaded = false
    w.setMinimumSize(s.minWidth, s.minHeight)
    const next = expandedAt(cur, s.expanded ?? cur)
    s.expanded = null
    matchPlayer(s, clampInto(next, screen.getDisplayMatching(cur).workArea)) // back to the player's height
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
    useContentSize: true,
    frame: false,
    resizable: false, // main sets the size (always the player's height)
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
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
  w.once('ready-to-show', () => {
    if (s.wanted) showSatellite(s)
  })
  w.on('maximize', () => w.unmaximize()) // Linux ignores maximizable:false; nothing may maximize
  // Satellites have no taskbar entry, so an OS-minimized one would be lost: restore and shade instead.
  w.on('minimize', () => {
    // Deferred: restoring inside the minimize event is unreliable.
    const normal = w.getNormalBounds() // restore() is async on Linux, so getBounds() right after could be stale
    setTimeout(() => {
      if (!live(w)) return
      w.restore()
      if (!s.shaded) toggleShade(s, normal)
    }, 0)
  })

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
  if (!live(s.win)) createSatellite(s)
  else showSatellite(s)
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
    if (!fromAppWindow(e) || !live(playlist.win)) return
    if (playlist.win.isMinimized()) playlist.win.restore()
    playlist.win.show()
    playlist.win.focus()
  })
  ipcMain.on(IPC.toggleShade, (e) => {
    if (!fromAppWindow(e)) return
    const s = satellites.find((x) => live(x.win) && e.sender === x.win.webContents)
    if (s) toggleShade(s)
  })
  ipcMain.on(IPC.minimize, (e) => {
    if (fromAppWindow(e)) BrowserWindow.fromWebContents(e.sender)?.minimize()
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
