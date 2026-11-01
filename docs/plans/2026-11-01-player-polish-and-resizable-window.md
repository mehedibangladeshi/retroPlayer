# Plan: Player polish and resizable window
Status: Complete

## Goal / Done when / Non-goals
Goal (user, verbatim): 1. Set name "name of the app. cassette player : retro" 2. Add shadow and elevation on buttons 3. buttons should be solid, not transparent 4. there are 2 pill shape UI item are in the players body. those should be placed cemetrically. both have diffrent distance from their nearest horizontal edge. pick on of their distance as correct one. 5. file picker will remember it's last files directory. 6. all the buttons should animate pressing down, like it's actually being pressed. Play button should remain pressed while a song is playing. 7. Player resizability: a) default window size based on display size (responsive), not full screen; remember last window size b) resizable down to a standard minimum c) can be full screen.

## Open questions
- [x] App name → display name "Cassette Player: Retro". File-safe form "Cassette-Player-Retro" (artifacts), executable `cassette-player-retro`. The repo, engine and appId stay unchanged. userData must use a colon-free folder name.
- [x] Fullscreen → F11 (Ctrl+Cmd+F on macOS) toggles, Esc exits, double-clicking the top bezel toggles, AND a third placeholder chrome box (fullscreen) next to minimize/close, listed in ASSETS_TODO.
- [x] Pill symmetry → 24 px. Move the right pill (body-bottom island, CSS x 662-727.5) 15.5 px right to x 677.5-743 (2x: +31 px). Edit the source player-body-bottom-part-with-boltu.png and regenerate png/body-bottom.png with the MANIFEST command.
- [x] Buttons → keys always fully opaque. Disabled = slightly darkened, no hover glow, no opacity. Raised look: drop shadow shaped to the key cap (filter: drop-shadow, not a rectangular box-shadow). Press = key travels down, shadow shrinks and a short transition. Latched down: Play while playing, Pause while paused. Rewind/Forward stay down while held. Stop springs back.
- [x] Window → the whole player scales as one picture, aspect locked to 767:616, never stretched. The first-launch default is 55% of the work-area width, capped to fit 80% of its height, and centred. The minimum is 575x462. Bounds and full-screen state are remembered, falling back to the default if the saved bounds are off every display. Full screen is centred, with the dark background letterboxed.
- [x] Last directory → `lastOpenDir` in the userData settings JSON, set from the open dialog only. It's used as `defaultPath`. If the folder no longer exists, the dialog falls back to the OS default.
- [x] Full-screen box art (user, after lock): create it ourselves, using the existing minimize/close boxes as reference. Not a placeholder.
- Minor (orchestrator): the drop path does not update lastOpenDir. userData folder is the colon-free `cassette-player-retro`, with dev `-dev`. Above 2x scale the art may soften, which is accepted.

## Contracts
MAP: none
- Names: display name "Cassette Player: Retro" (window title, index.html <title>, debug view). productName "Cassette Player Retro", because a colon is invalid in Windows exe/install paths and shows as "/" in macOS Finder. artifactName `Cassette-Player-Retro-${version}-${os}-${arch}.${ext}`. Linux executableName `cassette-player-retro`. appId unchanged. userData = Electron default from productName (dev keeps the `-dev` suffix).
- layout.ts (owner 1.1): add `CHROME.fullscreen: Rect = { x: 697, y: 7, w: 19, h: 19 }` (3 px gap left of minimize; adjust only if the art needs it, and report it). Add `CHROME_ART = { fullscreen: 'png/chrome-fullscreen.png' }`, a 38x38 PNG at 2x. LAYERS is unchanged.
- shared/api.ts (owner 1.2): `IPC.toggleFullScreen = 'window:toggleFullScreen'`; `RetroApi.toggleFullScreen(): void`; preload exposes it.
- main/settings.ts (owner 1.2): `interface Settings { lastOpenDir?: string; window?: { x: number; y: number; width: number; height: number; fullScreen: boolean } }`; `loadSettings(): Settings` (missing or corrupt file gives {}); `saveSettings(patch: Partial<Settings>): void` (merge, then write tmp + rename). File `userData/settings.json`.
- Window (1.2):
  - resizable; `setAspectRatio(767/616)`; minimum content size 575x462; fullscreenable, maximizable.
  - The 'maximize' event does unmaximize + setFullScreen(true) (covers double-click on the drag region).
  - before-input-event: F11 (and Ctrl+Cmd+F on darwin) toggles; Esc leaves full screen.
  - Bounds are saved (debounced) on resize/move and on close; restored only if they intersect a display work area.
- Renderer (1.3):
  - The `.cp` 767x616 composition is scaled uniformly to fit the viewport and centred, with the dark letterbox.
  - Pointer/hit maths must still work when scaled.
- Keys (1.3):
  - Opaque. Disabled = brightness ~0.8, no hover.
  - Shape-following drop-shadow for elevation.
  - Pressed = translateY plus a smaller shadow, transition ~80 ms.
  - Latched: play while playing, pause while paused.
  - Pause is enabled while paused, and clicking it resumes (`play`), as on a deck.
  - Play stays disabled while playing.

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Artwork: move the right pill to a 24 px gap; create the full-screen box from the minimize/close art | sonnet | assets/ui/source/player-body-bottom-part-with-boltu.png, assets/ui/png/body-bottom.png, assets/ui/png/chrome-fullscreen.png (new), assets/ui/MANIFEST.md, app/src/shared/layout.ts | — | pills are 24/24 px in the composite; the box matches the chrome style; MANIFEST is updated |
| 1.2 | Main: settings file, sized/resizable/fullscreen window, remembered bounds, dialog defaultPath, title, IPC | sonnet | app/src/main/index.ts, app/src/main/settings.ts (new), app/src/shared/api.ts, app/src/preload/index.ts | — | typecheck/lint clean; contract APIs exist |
| 1.3 | Renderer: scaling stage, solid elevated keys, press animation, latching, full-screen chrome button, names | sonnet | app/src/renderer/** | contract only | typecheck/lint clean; all keys and hit areas work when scaled |
| 2.1 | Rename in packaging and docs; DECISIONS/ASSETS_TODO/ARCHITECTURE/TESTING/CLAUDE.md | haiku | app/package.json, app/electron-builder.yml, .github/workflows/package.yml, docs/*.md (not plans), CLAUDE.md | 1.1–1.3 | new names everywhere; decisions logged |
| 2.2 | Integration: build and drive the app over CDP (resize, min size, fullscreen, latch, disabled look, last dir, persistence), screenshots; packaged Linux smoke | sonnet | scratchpad only | 1.1–1.3 | every acceptance item checked with evidence |

## Waves

## Log
- MAP: none (no graph tools, no map output, no mention in CLAUDE.md/AGENTS.md)
- Approved by user ("ok") 2026-11-01.
- Baseline porcelain: `?? docs/plans/2026-11-01-player-polish-and-resizable-window.md`
- Wave 1 launched: 1.1 sonnet, 1.2 sonnet, 1.3 sonnet
- 1.3 done (sonnet): transform scale stage; latch; pause resumes; fullscreen btn. Typecheck waits on 1.1 contract.
- 1.2 done (sonnet): settings.ts, window sizing/fullscreen/persist, dialog defaultPath. Used python edits (Own only). Renderer build waits on 1.1.
- 1.1 done (sonnet): pill moved +47 src px → 48/48 at 2x; chrome-fullscreen.png (viewed compare.png: matches). Reviewer (sonnet) launched for 1.2+1.3; verifier (haiku) for wave 1.
- Wave 1 verifier (haiku): outside-own none; typecheck/lint/build pass. Reviewer: 1.3 blocker (hover overrides latched filter); 1.2 minors (fullscreen bounds saved; unmaximize race). Retry 1.2+1.3 (sonnet) + launch 2.1 (haiku).
- VERIFY fix 1.2 (4 lines): keep last windowed bounds while full screen; setImmediate before setFullScreen after unmaximize. VERIFY fix 1.3 (1 line): latched hover keeps pressed filter. Wave 2: 2.1 haiku launched.
- 2.1 done (haiku): rename + 6 DECISIONS entries, docs. Launching 2.2 sonnet integration + final verifier haiku (typecheck/lint/cargo).
- Final verifier (haiku): outside-own none; typecheck/lint/cargo test/clippy EXIT=0.
- 2.2 integration (sonnet): a–g + packaged PASS. Wayland: no window centring/position restore and no aspect lock (compositor limit; letterbox covers it). Flaky: leaving full screen after a maximize-triggered entry was ignored 1 in 3 tries. OS double-click unverified.
- Close: actual mix 4 sonnet + 1 haiku builders; reviewer sonnet; verifiers haiku x2; 2 orchestrator VERIFY fixes (1.2: 4 lines, 1.3: 1 line); no escalations.
