import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type RetroApi } from '@shared/api'
import type { Album, EngineEvent } from '@shared/protocol'
import type { RackState } from '@shared/rack'

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
  openFolderDialog: () => ipcRenderer.invoke(IPC.openFolderDialog) as Promise<string | null>,
  pathForFile: (file) => webUtils.getPathForFile(file),
  minimizeWindow: () => ipcRenderer.send(IPC.minimize),
  closeWindow: () => ipcRenderer.send(IPC.close),
  quit: () => ipcRenderer.send(IPC.quit),
  showPlaylist: () => ipcRenderer.send(IPC.showPlaylist),
  toggleShade: () => ipcRenderer.send(IPC.toggleShade),
  onShaded: (cb) => {
    const listener = (_e: IpcRendererEvent, shaded: boolean): void => cb(shaded)
    ipcRenderer.on(IPC.shaded, listener)
    return () => {
      ipcRenderer.removeListener(IPC.shaded, listener)
    }
  },
  getRack: () => ipcRenderer.invoke(IPC.rackGet) as Promise<RackState>,
  doubleClickMs: () => ipcRenderer.invoke(IPC.doubleClickMs) as Promise<number>,
  onRack: (cb) => {
    const listener = (_e: IpcRendererEvent, s: RackState): void => cb(s)
    ipcRenderer.on(IPC.rackChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.rackChanged, listener)
    }
  },
  rackPlay: (dir) => ipcRenderer.send(IPC.rackPlay, dir),
  rackAdd: (dirs) => ipcRenderer.send(IPC.rackAdd, dirs),
  rackReorder: (dirs) => ipcRenderer.send(IPC.rackReorder, dirs),
  rackMenu: (dir) => ipcRenderer.send(IPC.rackMenu, dir),
  rackTracks: (dir) => ipcRenderer.invoke(IPC.rackTracks, dir) as Promise<Album | null>
}

contextBridge.exposeInMainWorld('retro', api)
