import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/api'
import { WINDOW } from '@shared/layout'
import { SUPPORTED_EXTENSIONS, type Command } from '@shared/protocol'
import { isValidCommand } from './ndjson'
import { Sidecar } from './sidecar'

let win: BrowserWindow | null = null
const sidecar = new Sidecar(() => win)
const devUrl = process.env.ELECTRON_RENDERER_URL

function fromMainWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return win !== null && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame
}

function createWindow(): void {
  const w = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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
  w.once('ready-to-show', () => w.show())
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
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: [...SUPPORTED_EXTENSIONS] }]
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.on(IPC.minimize, (e) => {
    if (fromMainWindow(e)) win?.minimize()
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
