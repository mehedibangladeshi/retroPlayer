# Plan: Track skip on click, clickable playlist rows, all windows at startup
Status: Verifying (wave 1)

## Goal / Done when / Non-goals
Goal (user's words): 1) one click on forward/backward goes to next/previous song; click-and-hold seeks forward/backward. 2) clicking an individual playlist song plays it. 3) app starts with all windows (main player, cover art, playlist), the latter two empty at startup. 4) verify and test ourselves. 5) all work on a separate `dev` branch.

## Open questions
- [x] Backward click: >3 s into track → restart (seek 0); else previous track (user).
- [x] No next/prev (single file, list ends): Forward click does nothing; Backward click restarts (user).
- [x] Hold = press ≥400 ms (existing HOLD_DELAY_MS) → seek ±10 s every 200 ms; release earlier = click (decided, existing timings).
- [x] Keyboard Left/Right unchanged (tap seeks 10 s, hold repeats); n/p stay next/prev (decided; AGENTS.md keyboard rule).
- [x] Playlist: single click plays the row (replaces double-click); Enter still plays (decided).
- [x] (scope add) Empty playlist (no album) shows an Open file / Open album prompt in the rows area (plain CSS like the player's cp-menu).
- [x] (scope add) Satellite minimize = "window shade": collapse to its own top bar, docked; only player minimize sends everything to the OS taskbar/dock. Unshade: minimize button again or double-click the top bar; while shaded the minimize icon becomes a 'restore' glyph (CSS placeholder, listed in ASSETS_TODO). Satellites get skipTaskbar; player minimize hides visible satellites, restore re-shows them.
- [x] Startup: player, playlist and album windows all open at launch; satellites never auto-hide on null album/cover; user-closed stays closed until restart (Ctrl+L reopens playlist); visibility not persisted (decided).

## Contracts
- `app/src/shared/api.ts`: `IPC.toggleShade = 'window:toggleShade'` (renderer→main, send, no args), `IPC.shaded = 'window:shaded'` (main→renderer, payload `boolean`). `RetroApi` gains `toggleShade(): void` and `onShaded(cb: (shaded: boolean) => void): () => void` (returns unsubscribe; same pattern as `onEvent`).
- New `app/src/shared/shade.ts`: `export const SHADE = { playlist: { designW: 937, barH: 80 }, album: { designW: 600, barH: 70 } } as const` (design px).
- New `app/src/main/shade.ts`: `shadedBounds(b: Rect, designW: number, barH: number): Rect` → same x, y, width; height = `Math.round(b.width * barH / designW)`.
- Renderer, while shaded: fit scale = `innerWidth / designW` (width only), otherwise unchanged min-of-both-axes.
- New `app/src/renderer/src/input/skip.ts`: `HOLD_DELAY_MS` stays 400 in useSeekHold; `backAction(positionMs: number, index: number | null): 'restart' | 'prev'` → 'restart' if positionMs > 3000 or index is null or 0, else 'prev'.
- Ownership: see Waves; one owner per file per wave.


## Waves
| # | Task | Tier | Files owned | Depends | Acceptance |
|---|---|---|---|---|---|
| 1.1 | Fwd/back click=skip, hold=seek | sonnet | renderer/src/input/useSeekHold.ts, renderer/src/input/skip.ts (new), renderer/src/engine/commands.ts, test/skip.test.ts (new) | — | test first; click<400ms fwd=stepTrack(+1), back=backAction; hold≥400ms seeks ±10s repeating; keys unchanged |
| 1.2 | Playlist single-click play + empty prompt | haiku | renderer/src/views/PlaylistView.tsx, PlaylistView.css | — | row onClick plays; album null → Open file/Open album buttons |
| 1.3 | All windows at startup, satellites skipTaskbar, player minimize hides/restores satellites, file dialog parented to sender | haiku | main/index.ts | — | 3 windows at launch; no hide on null album/cover |
| 2.1 | Shade: main + IPC + pure bounds | sonnet | main/index.ts, main/shade.ts (new), shared/api.ts, shared/shade.ts (new), preload/index.ts, test/shade.test.ts (new) | 1.3 | test first; toggle shrinks to bar, restores expanded bounds; persist keeps expanded; double-click (maximize event) toggles; follow/dock still works |
| 2.2 | Shade: renderer views + restore glyph | sonnet | renderer/src/views/PlaylistView.tsx/.css, AlbumView.tsx/.css | 1.2, contract | minimize button calls toggleShade; width-only scale when shaded; glyph swaps |
| 2.3 | Docs | haiku | AGENTS.md, docs/PROTOCOL.md, docs/DECISIONS.md, docs/ASSETS_TODO.md, docs/ARCHITECTURE.md | — | semantics updated |
| 3.1 | CDP end-to-end check of built app (no edits) | sonnet | none (scratchpad scripts only) | all | each behaviour observed |


## Commits
User request (2026-11-06): commit after each piece of work using `/git-commit`, on branch `dev`.
- After each wave verifies, the orchestrator runs `/git-commit` once per task, staging only that task's Own files (the first commit also includes this plan file).
- The pre-commit hook (typecheck, lint, JS tests, cargo test, clippy) must pass; never `--no-verify`.
- No AI attribution lines. No push unless asked.

## Log
- Baseline porcelain: `?? "assets/ui/all basic cassette/"`, `?? docs/plans/2026-11-06-transport-playlist-startup-windows.md`
- Branch `dev` created from main @ 12053ef.
- MAP: none (no code-graph tool or index found).
- Scout (sonnet, Explore) launched: transport click/hold, playlist row clicks, window creation.
- Approved 2026-11-06. Wave 1 launched: 1.1 sonnet, 1.2 haiku, 1.3 haiku.
- 1.1 done (sonnet): typecheck/lint/test pass, red seen first. Deviation: key repeat starts at 200ms instead of after 400ms delay — check in review.
- 1.2 done (haiku): row single-click plays, empty prompt; typecheck/lint pass.
- 1.3 done (haiku): satellites at launch, skipTaskbar, minimize/restore, dialog sender; removed Sidecar event callback (check events still reach renderers).
- Wave1 verifier: all 6 checks pass, outside-own none. Reviewer: 1.1 blocker (key repeat timing) → retry 1 sent to same builder; 1.2, 1.3 ok (minor: Sidecar onEvent param now unused).
- 1.1 retry 1 done: key timing restored (inspected useSeekHold.ts:47-77). Wave 1 accepted.
