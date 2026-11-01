# Plan: Album import with playlist window
Status: Complete
Branch: feature/album-import (worktree .claude/worktrees/album-import)

## Goal / Done when / Non-goals
Goal: import a whole album folder; a second window shows the album as a playlist styled from `assets/ui/playlist/playlist/` (preview.png = target look). Use embedded/folder cover art when present, else a default cover we create.

Done when: (TBD at lock)
Non-goals: (TBD at lock)

## Open questions
- [x] Queue owner → **Rust engine** (player-core). User chose 2026-11-01.
- [x] Tags + cover extraction → engine (orchestrator call, follows from above): folder scan (std::fs), tags title/artist/album/year/trackNo via symphonia (+ enable `id3v2` feature for MP3), cover = embedded art of first track that has one, else folder image (cover/folder/front .jpg/.png), else none → UI default. Cover sent once as a data URL in the `playlist` event; current track derived from `state.trackInfo.path` (no extra event on track change). Track order: disc/track number tag, then filename. No recursion into sub-folders.
- [x] Playlist window → second frameless BrowserWindow, auto-opens on album import beside the player, own chrome (minimise, close, resize grip, locked aspect 1874:1885), close = hide, re-shown by a new import or Ctrl/Cmd+L, bounds saved in settings.json.
- [x] Import entry → drop a folder on the player; Ctrl/Cmd+Shift+O folder dialog; Open button shows a small CSS popover "Open file… / Open album…". Album import then auto-plays track 1 (like single files).
- [x] Font → bundle one OFL condensed handwritten Google Font as .woff2 (swappable), licence file alongside.
- [x] Click a row plays it; current row in red (#8b3a3a-ish, title colour); Fwd/Back stay ±10 s seeks; auto-advance at track end, stop after last; single file replaces the album (playlist cleared, window hidden).
- [x] Default cover → our own abstract SVG (warm/teal gradient + grain), listed in ASSETS_TODO.md as placeholder.
- [x] Footer "Side A and B included" + status dots stay static, as in the design.
- Note: user's request overrides AGENTS.md decision 7 / ROADMAP "multiple windows, playlist, cover art out of scope" → record in DECISIONS.md.

## Contracts
MAP: none

### C1 · player-core `album` module (task 1.1 owns)
```rust
// engine/crates/player-core/src/album.rs, re-exported from lib.rs
pub struct Cover { pub mime: String, pub data: Vec<u8> }
pub struct AlbumTrack { pub path: PathBuf, pub title: String, pub artist: Option<String>,
    pub track_no: Option<u32>, pub disc_no: Option<u32>, pub duration_ms: Option<u64> }
pub struct Album { pub dir: PathBuf, pub title: Option<String>, pub artist: Option<String>,
    pub year: Option<String>, pub cover: Option<Cover>, pub tracks: Vec<AlbumTrack> }
pub fn scan_album(dir: &Path) -> Result<Album, PlayerError>;
// Playlist = pure queue logic, no I/O
pub struct Playlist { /* album + current: Option<usize> */ }
impl Playlist {
    pub fn new(album: Album) -> Self;            // current = None
    pub fn album(&self) -> &Album;
    pub fn current(&self) -> Option<usize>;
    pub fn select(&mut self, index: usize) -> Option<&Path>; // None if out of range; sets current
    pub fn advance(&mut self) -> Option<&Path>;  // next track, None after last (current unchanged)
}
```
- Extensions: flac wav mp3 m4a aac ogg oga (case-insensitive). Non-recursive. Hidden files skipped.
- Order: (disc_no or 1, track_no or MAX, file name). Unreadable/unsupported files skipped (logged by caller is fine; no panic).
- Album fields: from tags of the first track that has them; title fallback = folder name.
- Cover: first embedded visual (front cover preferred) of any track, else folder file `cover|folder|front|album` + `.jpg|.jpeg|.png` (case-insensitive), else None. Skip covers > 8 MiB.
- Errors: dir missing/not a dir → FileNotFound; no playable tracks → UnsupportedFormat.
- Enable symphonia `id3v2` (and `id3v1` if it exists in 0.6.1) in engine/Cargo.toml.

### C2 · Protocol (1.3 writes docs + TS; 2.1 writes Rust)
Commands: `{"v":1,"type":"loadAlbum","path":"/abs/dir"}`, `{"v":1,"type":"playIndex","index":2}`.
Event: `{"v":1,"type":"playlist","album":WireAlbum|null}`
```
WireAlbum      { dir, title: string|null, artist: string|null, year: string|null,
                 cover: string|null /* data:<mime>;base64,... */, tracks: WireAlbumTrack[] }
WireAlbumTrack { path, title, artist: string|null, trackNo: number|null, durationMs: number|null }
```
Engine semantics:
- `loadAlbum`: scan → on error emit `error` (playlist unchanged). On success emit `playlist{album}`, select(0), load, play.
- `playIndex`: out of range or no album → `error invalid_state`. Else load + play.
- `load` (single file): if an album is active, clear it and emit `playlist{album:null}` first.
- On `Ended` with an album: `advance()` → load + play; after last track stay Stopped.
- Current track is NOT an event: UI matches `state.trackInfo.path` against `tracks[].path` (same string: dir.join(file name)).
- Sidecar: stdin reader moves to its own thread; main loop reads one mpsc of `Input::Line(String) | Input::Ended`; forwarder still forwards every event and also sends `Input::Ended`. Player stays single-owner on the main thread.

### C3 · Main ↔ renderer API (1.3 writes types/preload; 2.2/2.3 implement main)
```ts
// api.ts additions
openFolderDialog(): Promise<string | null>   // IPC.openFolderDialog = 'dialog:openFolder'
showPlaylist(): void                          // IPC.showPlaylist = 'window:showPlaylist'
// minimizeWindow/closeWindow now act on the SENDER window; closing the playlist window hides it.
// commands.ts (renderer) additions: loadAlbum(path), playIndex(index) — plain send, no expectAutoPlay.
```
- `Sidecar` constructor takes `() => BrowserWindow[]`; events go to every live window; caches last `state` AND last `playlist` event and resends both on a window's did-finish-load (`resendState(win)`).
- isValidCommand: `loadAlbum` = non-empty string path (no extension check); `playIndex` = integer ≥ 0. Commands accepted from player OR playlist window webContents only.
- Main shows the playlist window on `playlist` with album ≠ null (creates it lazily), hides it on album = null.
- Playlist window: frameless, resizable by edges, aspect 1874:1885 (design 937×943 CSS px), hash `#playlist`, same preload/webPreferences, default height = player height, placed right of the player, bounds in `settings.playlistWindow` (same WindowState shape, fullScreen false).

### C4 · Assets + layout (1.2 owns)
- Ship from `assets/ui/playlist/`: `playlist-base.png`, `playlist-paper.png`, `playlist-top.png` (from 1st/3rd/4th), `default-cover.svg`, `fonts/<font>.woff2` + `fonts/OFL.txt`. `2nd cover only for reff.png` and `preview.png` → `assets/ui/playlist/reference/` (not shipped).
- `layout.ts` adds `PLAYLIST = { WINDOW:{w:937,h:943}, LAYERS:[{id,file,rect}], COVER:Rect, PAPER_TEXT:Rect /* writable area */, TITLE:{x,y,fontSize}, HEADING:Rect, ROW:{x,y0,pitch,fontSize}, FOOTER:{x,y,fontSize}, MINIMIZE:Rect, CLOSE:Rect, GRIP:Rect, FONT_FAMILY:string }` in design CSS px (2x art ÷ 2), measured from the PNGs / preview.

### Ownership note
Resize grip: decorative; window resizes via frameless edges like the player window (follow-up if a draggable grip is wanted).

## Waves
| # | Task | Tier | Own | Depends | Acceptance |
|---|---|---|---|---|---|
| 1.1 | Album scan + tags + cover + Playlist in player-core | sonnet | engine/Cargo.toml, engine/Cargo.lock, engine/crates/player-core/{Cargo.toml,src/album.rs,src/lib.rs,tests/album.rs} | — | C1; tests: order by track no then name, skips non-audio/hidden, folder cover found, missing dir/empty dir errors, Playlist select/advance bounds; cargo test + clippy pass |
| 1.2 | Playlist assets, default cover, font, layout constants, MANIFEST/ASSETS_TODO | sonnet | assets/ui/playlist/**, app/src/shared/layout.ts, assets/ui/MANIFEST.md, docs/ASSETS_TODO.md | — | C4; rects measured by magick; typecheck passes |
| 1.3 | Protocol doc + TS types + api/preload + renderer commands | haiku | docs/PROTOCOL.md, app/src/shared/protocol.ts, app/src/shared/api.ts, app/src/preload/index.ts, app/src/renderer/src/engine/commands.ts | — | C2/C3 types exact; doc JSON examples valid; typecheck + lint pass |
| 2.1 | Sidecar: protocol.rs, input channel, loadAlbum/playIndex/advance, stdio tests | sonnet | engine/crates/engine-sidecar/src/**, engine/crates/engine-sidecar/tests/** | 1.1, 1.3 | C2; every_doc_example_round_trips passes; stdio tests for loadAlbum ok/missing, playIndex out of range; cargo test + clippy pass |
| 2.2 | Main: broadcast + cached playlist resend, command validation, tests | sonnet | app/src/main/sidecar.ts, app/src/main/ndjson.ts, app/test/** | 1.3 | C3; node tests for loadAlbum/playIndex validation + playlist event parse; pnpm test passes |
| 2.3 | Main: playlist window, IPC handlers, settings | sonnet | app/src/main/index.ts, app/src/main/settings.ts | 1.3, 2.2 contract | C3; typecheck + lint pass |
| 3.1 | Renderer PlaylistView + #playlist route + album in store | sonnet | app/src/renderer/src/App.tsx, app/src/renderer/src/views/PlaylistView.{tsx,css}, app/src/renderer/src/engine/store.ts | 1.2, 1.3 | layers in order, default cover fallback, heading/rows/current row red, click → playIndex, min/close buttons; typecheck + lint |
| 3.2 | Player import paths: Open popover, folder drop, Ctrl/Cmd+Shift+O, Ctrl/Cmd+L | sonnet | app/src/renderer/src/views/CassettePlayer.{tsx,css}, app/src/renderer/src/input/** | 1.3 | popover styled in CSS, keyboard + drop work; typecheck + lint + pnpm test |
| 3.3 | Docs: ARCHITECTURE, DECISIONS, ROADMAP | haiku | docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/ROADMAP.md | 2.x | decisions recorded incl. override of decision 7 |
| 4.1 | End-to-end check: build, drive app over CDP with a generated tagged album (ffmpeg), screenshots | sonnet | scratchpad only (no repo files) | all | album loads, cover shows, click row plays, auto-advance, single-file load hides playlist |

Baseline `git status --porcelain`: `?? assets/ui/playlist/` · `?? docs/plans/2026-11-01-album-import.md`

## Log
- 2026-11-01 worktree created from main@a130254; untracked assets/ui/playlist copied in. Main has 2 uncommitted edits (electron-builder.yml, DECISIONS.md) left untouched.
- MAP: none
- 2026-11-01 Preview approved ("ok"). Wave 1 launched: 1.1 sonnet, 1.2 sonnet, 1.3 haiku.
- 1.3 done + verified (typecheck, lint, 16 JSON blocks ok, no outside-Own).
- 2.2 launched (sonnet). Contract addition: Sidecar(getWindows, onEvent?) + resendState(win); 2.3 runs after 2.2 (index.ts consumes the new signature).
- 1.1 verified (only expected doc round-trip failure). 1.2 done (font Sue Ellen Francisco; sizes are estimates). 2.2 done, diff read by orchestrator (ok). 2.3 done, sender check read (webContents+mainFrame, ok).
- Launched: 2.1 sonnet, reviewer(1.1,1.2) sonnet, 3.2 sonnet. Next: 3.1 when a slot frees; 3.3 after wave 2; then full-suite verifier + 4.1.
- 2.1 done (device auto-advance test passed). 3.1 done (title/footer come from base art; heading/row offsets need eye check). 3.2 done. 3.3 done.
- Review(2.1,2.3,3.2): no blockers. Fixed via haiku: toggleFullScreen mainFrame, restore minimized playlist, flush playlist bounds on quit, menu keyboard focus. Accepted: narrow stale-Ended race (needs epoch), rounded corners need transparent window (player also opaque).
- Final full-suite verifier launched; then 4.1 live E2E.
- Final suite green (cargo test, clippy, typecheck, lint, pnpm test, build). 4.1 E2E 9/9 pass.
- VERIFY fix 3.2 (1 line): .cp-menu z-index 20 so the error toast cannot cover it (seen in player-menu.png). Not re-run live.
- Actual mix: 10 planned tasks (2 haiku, 8 sonnet) + 2 haiku fix tasks; 0 escalations, 0 retries.
