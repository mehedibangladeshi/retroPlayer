import type { Album, Command, EngineEvent } from './protocol'
import type { RackState } from './rack'
export interface RetroApi {
  send(cmd: Command): void
  onEvent(cb: (e: EngineEvent) => void): () => void   // returns unsubscribe
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  pathForFile(file: File): string                       // webUtils.getPathForFile
  minimizeWindow(): void                                // acts on the window that calls it
  closeWindow(): void                                   // acts on the window that calls it; closing the playlist window hides it
  showPlaylist(): void
  quit(): void                                          // quits the whole app (the session is saved on quit)
  toggleShade(): void  // satellite windows: roll up to the top bar / restore
  onShaded(cb: (shaded: boolean) => void): () => void
  getRack(): Promise<RackState>
  getLocked(): Promise<boolean>
  onLocked(cb: (locked: boolean) => void): () => void
  onRack(cb: (s: RackState) => void): () => void
  rackPlay(dir: string): void
  rackAdd(dirs: string[]): void
  rackReorder(dirs: string[]): void
  rackMenu(dir: string | null): void
  rackTracks(dir: string): Promise<Album | null>
  doubleClickMs(): Promise<number>                      // the OS double-click time, read once at startup
}
export const IPC = { command: 'engine:command', event: 'engine:event', openDialog: 'dialog:open', openFolderDialog: 'dialog:openFolder', minimize: 'window:minimize', close: 'window:close', showPlaylist: 'window:showPlaylist', toggleShade: 'window:toggleShade', shaded: 'window:shaded', windowLocked: 'window:locked', getLocked: 'window:getLocked', quit: 'app:quit', rackGet: 'rack:get', rackChanged: 'rack:changed', rackPlay: 'rack:play', rackAdd: 'rack:add', rackReorder: 'rack:reorder', rackMenu: 'rack:menu', rackTracks: 'rack:tracks', doubleClickMs: 'os:doubleClickMs' } as const
