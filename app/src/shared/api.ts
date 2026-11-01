import type { Command, EngineEvent } from './protocol'
export interface RetroApi {
  send(cmd: Command): void
  onEvent(cb: (e: EngineEvent) => void): () => void   // returns unsubscribe
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  pathForFile(file: File): string                       // webUtils.getPathForFile
  minimizeWindow(): void                                // acts on the window that calls it
  closeWindow(): void                                   // acts on the window that calls it; closing the playlist window hides it
  toggleFullScreen(): void
  showPlaylist(): void
  resizeWindow(width: number, height: number): void  // grip drag on a side window; main clamps aspect and minimum size
}
export const IPC = { command: 'engine:command', event: 'engine:event', openDialog: 'dialog:open', openFolderDialog: 'dialog:openFolder', minimize: 'window:minimize', close: 'window:close', toggleFullScreen: 'window:toggleFullScreen', showPlaylist: 'window:showPlaylist', resizeWindow: 'window:resize' } as const
