# Plan: Playlist clicks, roll-back, font size, cover-art window redesign
Status: Verifying (waves 1-2), docs running

## Goal / Done when / Non-goals
Goal (user's words): 1) playlist window doesn't roll back; 2) playlist window font is too small — ask about a standard size across the app; 3) no clicking works inside the playlist window, not even Open file / Open album — check its UI implementation. 4) (scope add) redesign the cover-art window from `assets/ui/source/album cover deck/album cover deck/` (preview = target look).

## Open questions
- [x] Bugs seen on Linux `pnpm dev` (Wayland native; saved playlist 352x354, album 240x240, player 575x462).
- [x] User: playlist and cover-art windows always draw at the same height as the player; playlist text then matches the player's text size (rows 30 design px @ 943 ≈ player title 19 @ 616 at equal height; empty prompt/buttons sized to match the player menu: 13*943/616 ≈ 20 design px).
- Scout: scaling/tiny fonts confirmed; app-region+transform cause PLAUSIBLE not proven (player uses the same pattern at scale 0.75 and works). Need a live probe with real clicks.
- Hypothesis: the playlist root is CSS `transform: scale()`d (design 937 px → ~352 px window, scale ≈0.37). Electron computes `-webkit-app-region` drag/no-drag rects from untransformed layout, so on Windows/macOS the whole window becomes a drag region and no-drag buttons/rows map outside it → no clicks, minimize can't unshade. CDP-dispatched input bypassed OS hit-testing, so the 0.2.1 E2E missed it. Same scale makes fonts tiny.

- [x] Cover-art redesign assets (1874x1877 @2x ≈ 937x938.5 design px): `1. base.png` dark rounded panel; `2. reff art.png` sample cover = reference only, NOT shipped (real cover goes in the glass area); `3. buttons with shadow.png` three tabs "Cassette Box", "J-Flap", "Lyric" bottom-left; `4. top with glass and border and buttons.png` border + glass frame over the cover + minimize/close; `preview for your eyes only.png` = composed reference, not shipped.
- [x] Tabs: draw as designed, no action on click (user). Future features, not built now.
- [x] Satellite resize grip removed; satellites always match the player's height, docked or not (decided, user can object).

- [x] ROOT CAUSE (probe, confirmed by user clicks under XWayland): in PlaylistView the top artwork `<img class=pl-layer>` comes AFTER rows/buttons in the DOM and inherits `-webkit-app-region: drag` from `.pl`; Chromium builds regions in DOM order, so it re-covers the whole window with drag → every click is a title-bar click (double-click → OS maximize → our shade hack). Album works because nothing follows its buttons. Scaling (transform vs zoom) was NOT the cause. Live fix (layers no-drag) made buttons work.
- [x] User: "rebuild the whole window structure from the ground" for the side windows.
- [x] User: no window is ever full screen or maximized, the player included → remove fullscreen feature.
- [x] User: double-click does nothing anywhere. Roll-up/down = minimize button only.
- [x] User: Linux uses whatever platform is available (native Wayland: no docking accepted); must work perfectly on macOS and Windows.

## Contracts
- Drag rule (both side windows): exactly one drag element per window, `.pl-titlebar` / `.al-titlebar`, a strip from x=0 to just left of MINIMIZE, y=0 to the window's shade bar height (design px). It has no children. No other element in PlaylistView/AlbumView sets `-webkit-app-region` (stage, root, layers, rows, buttons all unset). Chrome buttons sit outside the strip.
- `app/src/shared/layout.ts` `ALBUM`: 1.1 adds `WINDOW: { w: 937, h: 938.5 }`, `ASSET_SCALE: 2`; 2.1 adds `LAYERS` (base, buttons, top under `album/`), `COVER` (glass inner rect; cover drawn between base and top), `MINIMIZE`, `CLOSE`, `TABS` (3 rects, display only), and removes the full-screen chrome constants.
- `SHADE.album` → `{ designW: 937, barH: <measured> }` (2.1).
- `app/src/main/dock.ts` (1.1): `matchHeight(playerHeight: number, aspect: number, minWidth: number): { width: number; height: number }` → height = playerHeight, width = max(minWidth, round(playerHeight * aspect)).
- Removed: `IPC.resizeWindow` + preload `resizeWindow` + main handler + `gripResize` (1.1); `.pl-grip`/`useGrip` (2.2); `IPC.toggleFullScreen` + preload + main handler, full-screen deferral, `fullScreen` in settings (1.1); player full-screen button + shortcut (1.2); full-screen chrome constants + `png/chrome-fullscreen.png` (2.1).
- All windows: `maximizable: false`, `fullscreenable: false`; keep `'maximize' → unmaximize()` guard (Linux ignores maximizable); remove the maximize→toggle-shade hack. Side windows: `resizable: false` (size set by main only), `skipTaskbar: true`.

## Waves
| # | Task | Tier | Own | Depends | Acceptance |
|---|---|---|---|---|---|
| 0.1 | CDP click probe | haiku | scratchpad | — | DONE: root cause found |
| 1.1 | Main: window options, equal height, remove grip + full screen + double-click shade | sonnet | main/index.ts, main/dock.ts, main/settings.ts, shared/api.ts, preload/index.ts, shared/layout.ts (ALBUM.WINDOW only), test/height.test.ts (new), test/dock.test.ts | — | test first for matchHeight; side windows = player height at launch, on player resize, after unshade |
| 1.2 | Player: remove full-screen button + shortcut | haiku | views/CassettePlayer.tsx/.css, input/useKeyboard.ts | — | no full-screen UI or calls left |
| 2.1 | Cover-art rebuild + redesign | sonnet | assets/ui/album/* (new), assets/ui/png/chrome-fullscreen.png (delete), assets/ui/MANIFEST.md, docs/ASSETS_TODO.md, shared/layout.ts, shared/shade.ts, views/AlbumView.tsx/.css | 1.1 | matches preview; drag rule; tabs inert |
| 2.2 | Playlist rebuild | sonnet | views/PlaylistView.tsx/.css | 1.1 | drag rule; no grip; prompt ≈ player menu size |
| 2.3 | Drag-rule guard test | haiku | test/dragRegions.test.ts (new) | contract | fails if any selector other than the titlebar sets app-region in the two view CSS files or inline |
| 3.1 | Docs | haiku | AGENTS.md, docs/DECISIONS.md, docs/ARCHITECTURE.md | wave 2 | decisions logged |
| 3.2 | E2E (CDP) + user real clicks | sonnet | scratchpad | wave 2 | regions list clean; heights equal; screenshots vs preview; user confirms |

## Log
- Branch `dev` @ 19d2fe7 (v0.2.1-beta).
- MAP: none.
- Approved 2026-11-06. Baseline porcelain: ?? assets/ui/all basic cassette/, ?? assets/ui/source/album cover deck/, ?? this plan.
- 0.1 haiku launched.
- Approved (rebuild plan). Wave 1 launched: 1.1 sonnet, 1.2 haiku. Baseline porcelain: ?? assets/ui/all basic cassette/, ?? assets/ui/source/album cover deck/, ?? this plan.
- 1.2 done (haiku): full-screen button removed; no shortcut/dblclick in renderer; lint pass; typecheck pending 1.1.
- 1.1 done (sonnet): red seen; tests 39 pass, lint clean; typecheck only PlaylistView.tsx:55 resizeWindow (2.2 removes). Commit wave 1 together with wave 2.
- Wave 2 launched: 2.1 sonnet, 2.2 sonnet, 2.3 haiku.
- 2.2 done (sonnet): one .pl-titlebar drag strip, grip removed, prompt 20px; typecheck/lint/test pass.
- 2.3 done (haiku): dragRegions.test.ts; Playlist green, Album red pending 2.1 (expected).
- 2.1 done (sonnet): album layers exported, ALBUM constants, barH 62, fullscreen chrome removed; 47 tests pass. Retry 1 sent: COVER from reff-art bbox + composite diff vs preview.
- Review 1.1 + 2.2: no blockers. Follow-up sent to 1.1 (skip matchPlayer while player minimized). Minor for 2.1: PLAYLIST.GRIP now unused in layout.ts.
- 1.1 follow-up done: matchPlayer/followPlayer skip while minimized; restore resyncs. 2.1 retry: COVER 82.5,84.5 770x770 from reff art; composite vs preview MAE ~0.06/255.
- 2.1 cleanup: PLAYLIST.GRIP removed. Wave 1+2 verify + 2.1 review + 3.1 docs launched.
- 2.1 review: no blockers; minors: al-titlebar touches MINIMIZE (no gap), ASSETS_TODO item 16 mentions removed GRIP. Fix after verifier.
- Verifier waves 1-2: all checks pass (47 tests), outside-own none; app-region only in titlebars for side windows. 2.1 minor fixes sent.
- 3.1 docs done (haiku): DECISIONS +36/-0, ARCHITECTURE, AGENTS drag-rule bullet.
- Commits made via /git-commit (source layers + AGENTS line 69 left out, not confirmed).
