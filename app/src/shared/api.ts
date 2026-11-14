import type { Command, EngineEvent } from './protocol'
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
}
export const IPC = { command: 'engine:command', event: 'engine:event', openDialog: 'dialog:open', openFolderDialog: 'dialog:openFolder', minimize: 'window:minimize', close: 'window:close', showPlaylist: 'window:showPlaylist', toggleShade: 'window:toggleShade', shaded: 'window:shaded', quit: 'app:quit' } as const
