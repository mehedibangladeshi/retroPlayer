# Plan: Album art window + playlist polish
Status: Complete
Branch: feature/album-import (worktree .claude/worktrees/album-import), on top of the uncommitted album-import work (plan 2026-11-01-album-import.md).

## Goal / Done when / Non-goals
Goal:
1. Playlist window first appears flush against the player's right edge; afterwards the user moves it freely (saved bounds win).
2. New album-art window: shows the cover in its own window, first appearing flush against the player's left edge; behaves like the playlist window.
3. Double-click a track name in the playlist to play it.
4. Show each track's duration beside its name.

Done when: (TBD at lock)
Non-goals: (TBD at lock)

## Open questions
- [x] Album window for albums AND single songs → engine `artwork` event on every load.
- [x] Frame → CSS placeholder in playlist colours; min/close reuse playlist-top.png button art (cropped); ASSETS_TODO entry.
- [x] Row click → select (subtle highlight); double-click or Enter plays. User added: keys N = next, P = previous track (player + playlist windows; no-op at ends / no album).
- [x] Attached = first placement only: 0 px gap, top-aligned, same height; saved bounds win afterwards; no docking.
- [x] Duration → right-aligned m:ss column, blank when null.

## Contracts
MAP: none
Baseline (uncommitted album-import work): file list + `git hash-object` hashes in scratchpad `run2-files.txt` / `run2-hashes.txt` (same line order). A path changed this run = hash differs or path not in the list.

### K1 · `artwork` event (A writes Rust + PROTOCOL.md; B writes TS)
`{"v":1,"type":"artwork","cover":"data:image/jpeg;base64,..." }` or `{"v":1,"type":"artwork","cover":null}`.
- Sent by the sidecar after every successful track load (single `load`, loadAlbum's first track, playIndex, auto-advance): cover = `player_core::track_cover(path)` (that file's embedded art, front preferred, else folder image cover|folder|front|album .jpg/.jpeg/.png in its directory, ≤ 8 MiB) else the active album's cover else null. Sent only when different from the last one sent (compare mime+bytes). Failed load → null (if different). Panic path → reset + null.
- player-core: `pub fn track_cover(path: &Path) -> Option<Cover>` in album.rs (re-exported), reusing scan_album's visual/folder logic.
- TS: `EngineEvent |= { type: 'artwork'; cover: string | null }`. Main `Sidecar` caches the last artwork event and resends it in `resendState(win)`; on engine down, if cached non-null → clear + emit `{type:'artwork',cover:null}`. ndjson EVENT_TYPES += 'artwork'.

### K2 · Windows (C)
- Album window: hash `#album`, frameless, aspect 1:1, min 240x240, same webPreferences, close = hide unless quitting, bounds in `settings.albumWindow`, created lazily and shown (showInactive, restore if minimized) on `artwork` with cover ≠ null, hidden on null. Default placement: square of player content height, right edge flush to player's left edge (x = player.x - size), y = player.y, clamped into the work area.
- Playlist default placement: x = player.x + player.width (0 gap), y = player.y, height = player height.
- fromAppWindow / getWindows / player-close destroy+persist all include the album window.

### K3 · Renderer (D1 album view, D2 playlist + keys)
- store.ts (D1): `artwork: string | null`, set on `artwork` events.
- commands.ts (D2): `stepTrack(delta: 1 | -1)`: from the store's `album` + `state.trackInfo.path` find the current index; target = idx+delta; if album null, current not found, or target out of range → do nothing; else `playIndex(target)`.
- Keys N / P (no modifiers, case-insensitive) → stepTrack(+1/-1) in the player (useKeyboard) and in the playlist window (PlaylistView keydown); ignored while typing/menu focus as existing rules.

## Waves
| # | Task | Tier | Own | Depends | Acceptance |
|---|---|---|---|---|---|
| A | Engine: track_cover + sidecar artwork event + PROTOCOL.md + tests | sonnet | engine/crates/player-core/src/album.rs, src/lib.rs, tests/album.rs, engine/crates/engine-sidecar/src/**, tests/**, docs/PROTOCOL.md | — | K1; tests: dedupe, single-file folder cover, null on no art; cargo test + clippy |
| B | TS artwork type, ndjson, Sidecar cache/resend, node test | haiku | app/src/shared/protocol.ts, app/src/main/ndjson.ts, app/src/main/sidecar.ts, app/test/** | — | K1 TS side; typecheck/lint/test |
| C | Main: album window + flush placements | sonnet | app/src/main/index.ts, app/src/main/settings.ts | B | K2; typecheck/lint/test/build |
| D1 | AlbumView + #album route + store artwork + ASSETS_TODO | sonnet | app/src/renderer/src/App.tsx, views/AlbumView.{tsx,css}, engine/store.ts, docs/ASSETS_TODO.md | B | K3; typecheck/lint/build |
| D2 | Playlist select/double-click/Enter, duration column, N/P keys | sonnet | views/PlaylistView.{tsx,css}, engine/commands.ts, input/useKeyboard.ts | B | K3; typecheck/lint/test |
| E | Docs: ARCHITECTURE, DECISIONS | haiku | docs/ARCHITECTURE.md, docs/DECISIONS.md | A–D | decisions recorded |
| F | Live E2E re-run (scratchpad only) | sonnet | scratchpad | all | 5 behaviours observed + screenshots |

## Log
- 2026-11-01 new run. Baseline = uncommitted album-import changes (see `git status` at wave 1).
- Approved ("ok"). Wave 1 launched: A sonnet, B haiku, D2 sonnet (D2 has no dependency on B).
- B, C, D1, D2, A done. Review(A,C,D2): no blockers. VERIFY fix C (1 line): showPlaylist restores a minimized window. Accepted minor D2: Enter on a Tab-focused unselected row only selects.
- E done. Full suite green, no outside-Own changes vs baseline hashes. F live: 8/8 pass (placement verified under --ozone-platform=x11; native Wayland ignores window positions). Settings restored byte-identical.
- Actual mix: 2 haiku, 5 sonnet; 0 retries, 0 escalations; 1 VERIFY fix (C, 1 line).
