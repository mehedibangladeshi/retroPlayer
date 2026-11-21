import type { Album, Command, EngineEvent } from './protocol'
import type { AlbumCustom, RackState } from './rack'
import type { CassetteDesign } from './cassettes'
export type VisualizerMode = 'bars' | 'wave'
export const parseVisualizerMode = (v: unknown): VisualizerMode | undefined => (v === 'bars' || v === 'wave' ? v : undefined)
/** The Album Edit dialog's target. defaultText = spineText(album) (no override); cover = custom cover if set, else the folder's. */
export interface AlbumEditState { dir: string; defaultText: string; cover: string | null; design: CassetteDesign | null; custom: AlbumCustom }
/** custom.cover is ignored by main: a new cover is named only through coverToken (from pickAlbumCover). */
export interface AlbumEditSave { dir: string; design: CassetteDesign; custom: AlbumCustom; coverToken?: string }
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
  getVisualizerMode(): Promise<VisualizerMode>          // saved power-deck visualizer mode
  setVisualizerMode(m: VisualizerMode): void
  doubleClickMs(): Promise<number>                      // the OS double-click time, read once at startup
  openAlbumEdit(dir: string): void                      // any app window: opens or retargets the single edit window
  getAlbumEdit(): Promise<AlbumEditState | null>        // edit window only: its current target
  onAlbumEdit(cb: (s: AlbumEditState) => void): () => void // edit window: pushed when retargeted while open
  pickAlbumCover(): Promise<{ token: string; dataUrl: string } | null> // edit window only: main's image dialog; dataUrl is a preview
  saveAlbumEdit(save: AlbumEditSave): Promise<void>     // edit window only: rejects on invalid input
  closeAlbumEdit(): void                                // edit window only: closes it, discarding a pending cover
}
export const IPC = { command: 'engine:command', event: 'engine:event', openDialog: 'dialog:open', openFolderDialog: 'dialog:openFolder', minimize: 'window:minimize', close: 'window:close', showPlaylist: 'window:showPlaylist', toggleShade: 'window:toggleShade', shaded: 'window:shaded', windowLocked: 'window:locked', getLocked: 'window:getLocked', quit: 'app:quit', rackGet: 'rack:get', rackChanged: 'rack:changed', rackPlay: 'rack:play', rackAdd: 'rack:add', rackReorder: 'rack:reorder', rackMenu: 'rack:menu', rackTracks: 'rack:tracks', getVisualizerMode: 'ui:getVisualizerMode', setVisualizerMode: 'ui:setVisualizerMode', doubleClickMs: 'os:doubleClickMs', openAlbumEdit: 'edit:open', getAlbumEdit: 'edit:get', albumEditChanged: 'edit:changed', pickAlbumCover: 'edit:pickCover', saveAlbumEdit: 'edit:save', closeAlbumEdit: 'edit:close' } as const
