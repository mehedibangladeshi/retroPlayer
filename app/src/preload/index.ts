import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type RetroApi } from '@shared/api'
import type { EngineEvent } from '@shared/protocol'

const api: RetroApi = {
  send: (cmd) => ipcRenderer.send(IPC.command, cmd),
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, evt: EngineEvent): void => cb(evt)
    ipcRenderer.on(IPC.event, listener)
    return () => {
      ipcRenderer.removeListener(IPC.event, listener)
    }
  },
  openFileDialog: () => ipcRenderer.invoke(IPC.openDialog) as Promise<string | null>,
  pathForFile: (file) => webUtils.getPathForFile(file),
  minimizeWindow: () => ipcRenderer.send(IPC.minimize),
  closeWindow: () => ipcRenderer.send(IPC.close)
}

contextBridge.exposeInMainWorld('retro', api)
