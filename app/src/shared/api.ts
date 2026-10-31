import type { Command, EngineEvent } from './protocol'
export interface RetroApi {
  send(cmd: Command): void
  onEvent(cb: (e: EngineEvent) => void): () => void   // returns unsubscribe
  openFileDialog(): Promise<string | null>
  pathForFile(file: File): string                       // webUtils.getPathForFile
  minimizeWindow(): void
  closeWindow(): void
}
export const IPC = { command: 'engine:command', event: 'engine:event', openDialog: 'dialog:open', minimize: 'window:minimize', close: 'window:close' } as const
