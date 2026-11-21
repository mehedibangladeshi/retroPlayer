import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type AlbumEditState, type RetroApi } from '@shared/api'
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
  getVisualizerMode: () => ipcRenderer.invoke(IPC.getVisualizerMode) as Promise<'bars' | 'wave'>,
  setVisualizerMode: (m) => ipcRenderer.send(IPC.setVisualizerMode, m),
  getLocked: () => ipcRenderer.invoke(IPC.getLocked) as Promise<boolean>,
  onLocked: (cb) => {
    const listener = (_e: IpcRendererEvent, locked: boolean): void => cb(locked)
    ipcRenderer.on(IPC.windowLocked, listener)
    return () => {
      ipcRenderer.removeListener(IPC.windowLocked, listener)
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
  rackTracks: (dir) => ipcRenderer.invoke(IPC.rackTracks, dir) as Promise<Album | null>,
  openAlbumEdit: (dir) => ipcRenderer.send(IPC.openAlbumEdit, dir),
  getAlbumEdit: () => ipcRenderer.invoke(IPC.getAlbumEdit) as Promise<AlbumEditState | null>,
  onAlbumEdit: (cb) => {
    const listener = (_e: IpcRendererEvent, s: AlbumEditState): void => cb(s)
    ipcRenderer.on(IPC.albumEditChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.albumEditChanged, listener)
    }
  },
  pickAlbumCover: () => ipcRenderer.invoke(IPC.pickAlbumCover) as Promise<{ token: string; dataUrl: string } | null>,
  saveAlbumEdit: (save) => ipcRenderer.invoke(IPC.saveAlbumEdit, save) as Promise<void>,
  closeAlbumEdit: () => ipcRenderer.send(IPC.closeAlbumEdit)
}

contextBridge.exposeInMainWorld('retro', api)
