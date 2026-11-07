import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { ALBUM, PLAYLIST, WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Command } from '@shared/protocol'
import { SHADE } from '@shared/shade'
import { clampInto, expandedAt, shadedBounds } from './shade'
import { fitGroup, inferDocks, layout, matchHeight, overlaps, snap, subtree, type Docks, type Rect } from './dock'
import { x11Relaunch } from './platform'
import { isValidCommand } from './ndjson'
import { loadSettings, saveSettings, type WindowState } from './settings'
import { defaultPlayerSize } from './windowSize'
import { Sidecar } from './sidecar'

let win: BrowserWindow | null = null
let quitting = false
// "Satellite" windows (playlist, album art): frameless, open with the player, hidden instead of closed, hidden while the player is minimized.
interface Satellite {
  hash: 'playlist' | 'album' // also its id in the dock graph (the player is 'player')
  title: string
  aspect: number
  minWidth: number
  minHeight: number
  key: 'playlistWindow' | 'albumWindow'
  win: BrowserWindow | null
  wanted: boolean
  shaded: boolean // rolled up to its top bar
  expanded: Rect | null // bounds to restore on unshade
  timer?: NodeJS.Timeout
}
const PL_ASPECT = PLAYLIST.WINDOW.w / PLAYLIST.WINDOW.h
const PL_MIN_WIDTH = 320
const playlist: Satellite = {
  hash: 'playlist', title: 'Cassette Player: Playlist', aspect: PL_ASPECT, minWidth: PL_MIN_WIDTH, minHeight: 308 /* the player's MIN_HEIGHT: a side window must always fit its height */, key: 'playlistWindow', win: null, wanted: false, shaded: false, expanded: null
}
const album: Satellite = {
  hash: 'album', title: 'Cassette Player: Album', aspect: ALBUM.WINDOW.w / ALBUM.WINDOW.h, minWidth: 240, minHeight: 240, key: 'albumWindow', win: null, wanted: false, shaded: false, expanded: null
}
const satellites = [playlist, album]
// Who is docked to whom (in memory; read back from the saved positions at startup). Any window can dock to any side
// of any other; docked windows follow their anchor, so everything docked to the player moves with it.
const DEFAULT_DOCKS: Docks = { playlist: { to: 'player', side: 'right', ratio: 0 }, album: { to: 'player', side: 'left', ratio: 0 } }
let docks: Docks = { ...DEFAULT_DOCKS }
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
// A docked window is placed by its dock when it is shown, so its start position does not matter much.
function satelliteBounds(s: Satellite): { x?: number; y?: number; width: number; height: number } {
  const size = matchHeight(live(win) ? win.getBounds().height : MIN_HEIGHT, s.aspect, s.minWidth)
  const fitted = fitSaved(loadSettings()[s.key], s.aspect, s.minWidth)
  if (fitted) return { x: fitted.x, y: fitted.y, ...size }
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
const expected = new Map<BrowserWindow, Array<{ x: number; y: number; until: number }>>()
function programmatic(w: BrowserWindow, r: Rect): void {
  const b = w.getBounds()
  const now = Date.now()
  const keep = (expected.get(w) ?? []).filter((p) => p.until >= now)
  expected.set(w, [...keep, { x: b.x, y: b.y, until: now + 1000 }, { x: r.x, y: r.y, until: now + 1000 }])
  // A pure move uses setPosition: on Windows at fractional display scaling, setBounds can drift the size by a pixel.
  if (b.width === r.width && b.height === r.height) w.setPosition(r.x, r.y)
  else w.setBounds(r)
}
function isOwn(w: BrowserWindow): boolean {
  const now = Date.now()
  const b = w.getBounds()
  return (expected.get(w) ?? []).some((p) => p.until >= now && Math.abs(b.x - p.x) <= 1 && Math.abs(b.y - p.y) <= 1)
}
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

// Side windows are not user-resizable, and GTK ignores size changes on a fixed window: lift the lock around the change.
// X11 pins a fixed window's minimum size to its size, so a new minimum (`min`) is set inside the lift too.
function resizeFixed(w: BrowserWindow, r: Rect, min?: [number, number]): void {
  w.setResizable(true)
  if (min) w.setMinimumSize(...min)
  programmatic(w, r)
  w.setResizable(false)
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

// Bring every window to where it belongs: side windows take the player's height (shaded ones keep their bar and
// only update the size they unroll to), docked windows are placed against their anchor, detached ones stay on screen.
// Returns the bounds it laid out (empty while the player is minimized).
function sync(over: Record<string, Rect> = {}, extra?: Satellite): Record<string, Rect> {
  if (!live(win) || win.isMinimized()) return {} // a minimized player's bounds can be bogus
  const rects = rectsNow(over, extra)
  const p = rects.player
  const work = screen.getDisplayMatching(p).workArea
  for (const s of satellites) {
    const size = matchHeight(p.height, s.aspect, s.minWidth)
    if (s.shaded) {
      if (s.expanded) s.expanded = { ...s.expanded, ...size }
      continue
    }
    const r = rects[s.hash]
    if (!r) continue // hidden: sized when it is shown
    rects[s.hash] = { ...r, ...size }
    if (!docks[s.hash]) rects[s.hash].y = Math.max(work.y, Math.min(r.y, work.y + work.height - size.height))
  }
  const out = layout(rects, docks)
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
  const rects = rectsNow()
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
}
const settleTimers = new Map<string, NodeJS.Timeout>()
function settleSoon(id: string): void {
  clearTimeout(settleTimers.get(id))
  settleTimers.set(id, setTimeout(() => settle(id), 120))
}

// Show a wanted satellite on a real hidden -> shown transition only.
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
  const rects = sync({}, s)
  const p = rects.player
  if (!p) return
  const group = subtree(docks, 'player')
  const { dx, dy } = fitGroup([...group].filter((id) => rects[id]).map((id) => rects[id]), screen.getDisplayMatching(p).workArea)
  if (!dx && !dy) return
  const moved = { ...p, x: p.x + dx, y: p.y + dy }
  // Never nudge the player onto a detached window.
  if (Object.entries(rects).some(([id, r]) => !group.has(id) && overlaps(moved, r))) return
  programmatic(win, moved) // the nudge
  sync({ player: moved }, s)
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
    if (w.isMinimized() || isOwn(w)) return
    sync()
  }
  w.on('resize', followPlayer)
  w.on('move', followPlayer)
  w.on('move', () => {
    if (!w.isMinimized() && !isOwn(w)) settleSoon('player')
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
    resizeFixed(w, r, [s.minWidth, r.height])
    sync({ [s.hash]: r }) // windows docked below it move up
  } else {
    s.shaded = false
    const next = clampInto(expandedAt(cur, s.expanded ?? cur), screen.getDisplayMatching(cur).workArea)
    s.expanded = null
    resizeFixed(w, next, [s.minWidth, s.minHeight])
    sync({ [s.hash]: next }) // back to the player's height, docked
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
  const ignored = (): boolean => isOwn(w) || !w.isVisible() || !live(win) || win.isMinimized() || atDock()
  let tearTimer: NodeJS.Timeout | undefined
  const dragged = (): void => {
    if (ignored()) return
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
  w.on('move', dragged)
  w.on('resize', dragged)
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

  // macOS: a Dock icon click with no window in front brings the player (and so every window) back.
  app.on('activate', () => {
    if (!live(win)) return
    if (win.isMinimized()) win.restore()
    win.focus()
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
