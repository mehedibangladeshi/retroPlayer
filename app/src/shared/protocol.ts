// Mirrors docs/PROTOCOL.md (source of truth) and the Rust types in engine/crates/engine-sidecar. Change PROTOCOL.md first.
export const PROTOCOL_VERSION = 1 as const
export type Status = 'empty' | 'stopped' | 'playing' | 'paused'
export interface TrackInfo { title: string; path: string; codec: string; sampleRate: number; channels: number }
export interface AlbumTrack { path: string; title: string; artist: string | null; trackNo: number | null; durationMs: number | null }
export interface Album { dir: string; title: string | null; artist: string | null; year: string | null; cover: string | null /* data:<mime>;base64,... */; tracks: AlbumTrack[] }
export type ErrorCode = 'unsupported_format' | 'file_not_found' | 'no_output_device' | 'decode_error' | 'invalid_state' | 'bad_message' | 'internal' | 'engine_crashed'
type V = { v: typeof PROTOCOL_VERSION }
export type Command = V & ({ type: 'load'; path: string } | { type: 'play' } | { type: 'pause' } | { type: 'stop' } | { type: 'seek'; positionMs: number } | { type: 'seekRelative'; deltaMs: number } | { type: 'loadSound'; name: string; path: string } | { type: 'playSound'; name: string } | { type: 'loadAlbum'; path: string } | { type: 'playIndex'; index: number })
export type EngineEvent = V & ({ type: 'state'; status: Status; positionMs: number; durationMs: number | null; trackInfo: TrackInfo | null } | { type: 'position'; positionMs: number } | { type: 'ended' } | { type: 'error'; code: ErrorCode; message: string } | { type: 'playlist'; album: Album | null } | { type: 'artwork'; cover: string | null })
export const SUPPORTED_EXTENSIONS = ['flac', 'wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga'] as const
