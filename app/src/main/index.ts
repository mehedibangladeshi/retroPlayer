import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Command } from '@shared/protocol'
import { isValidCommand } from './ndjson'
import { loadSettings, saveSettings } from './settings'
import { Sidecar } from './sidecar'

let win: BrowserWindow | null = null
const sidecar = new Sidecar(() => win)
const devUrl = process.env.ELECTRON_RENDERER_URL

function fromMainWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return win !== null && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame
}

const ASPECT = WINDOW.width / WINDOW.height
const MIN_WIDTH = 575
const MIN_HEIGHT = 462

// Sizes below are content sizes (the window is frameless, so content == window).
function initialBounds(): { x?: number; y?: number; width: number; height: number; fullScreen: boolean } {
  const saved = loadSettings().window
  if (saved) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      const ow = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x)
      const oh = Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y)
      return ow >= 100 && oh >= 50
    })
    if (visible) {
      // Clamp to the work area of the display the window lands on, keeping the aspect ratio:
      // a corrupt or hand-edited settings.json must not open a window larger than the screen.
      const a = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }).workArea
      const maxWidth = Math.max(MIN_WIDTH, Math.min(a.width, Math.floor(a.height * ASPECT)))
      const width = Math.min(maxWidth, Math.max(MIN_WIDTH, Math.round(saved.width)))
      return { x: Math.round(saved.x), y: Math.round(saved.y), width, height: Math.round(width / ASPECT), fullScreen: saved.fullScreen }
    }
  }
  const area = screen.getPrimaryDisplay().workAreaSize
  let width = Math.round(0.55 * area.width)
  if (width / ASPECT > 0.8 * area.height) width = Math.round(0.8 * area.height * ASPECT)
  width = Math.max(MIN_WIDTH, width)
  return { width, height: Math.round(width / ASPECT), fullScreen: false }
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
    maximizable: true,
    fullscreenable: true,
    title: 'Cassette Player: Retro',
    backgroundColor: '#2b2e36',
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
  w.on('close', () => {
    clearTimeout(timer)
    persist()
  })
  // The frameless window's double-click on the drag region makes the OS maximize it; full screen is what we want instead.
  w.on('maximize', () => {
    w.unmaximize()
    setImmediate(() => w.setFullScreen(true)) // unmaximize is async on Linux
  })
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
  w.webContents.on('did-finish-load', () => sidecar.resendState())
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  if (devUrl) void w.loadURL(devUrl)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
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
    if (!fromMainWindow(e)) return
    if (!isValidCommand(cmd)) {
      console.warn('[main] dropped invalid command', cmd)
      return
    }
    sidecar.send(cmd as Command)
  })
  ipcMain.handle(IPC.openDialog, async (e): Promise<string | null> => {
    if (!fromMainWindow(e) || !win) return null
    const r = await dialog.showOpenDialog(win, {
      defaultPath: lastOpenDir(),
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: [...SUPPORTED_EXTENSIONS] }]
    })
    const file = r.canceled ? null : (r.filePaths[0] ?? null)
    if (file) saveSettings({ lastOpenDir: dirname(file) })
    return file
  })
  ipcMain.on(IPC.minimize, (e) => {
    if (fromMainWindow(e)) win?.minimize()
  })
  ipcMain.on(IPC.toggleFullScreen, (e) => {
    if (fromMainWindow(e)) win?.setFullScreen(!win.isFullScreen())
  })
  ipcMain.on(IPC.close, (e) => {
    if (fromMainWindow(e)) win?.close()
  })

  app.on('before-quit', () => sidecar.stop())
  app.on('window-all-closed', () => app.quit())
  void app.whenReady().then(() => {
    createWindow()
    sidecar.start()
  })
}
