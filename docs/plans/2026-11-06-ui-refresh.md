# Plan: Player buttons, playlist base, window size, tape-motor sound
Status: Complete

## Goal / Done when / Non-goals
Goal (user): 1. separate worktree from dev; 2. replace player buttons with `~/Downloads/replaceble parts/player buttons with shadow.png` (redraw if needed); 3. playlist window base from `~/Downloads/replaceble parts/1st playlist base.png`; 4. recalculate the default player window size (too big); 5. play `~/Downloads/tape motor sound/tape motor sound.mp3` while forward/rewind is long-pressed, alongside the current seek.

Done when:
- New key caps (with baked shadow) show in the player, shadow not clipped, press/latched/disabled states still read; hit areas unchanged.
- Playlist window shows the new base; window size, rows and buttons unchanged.
- First launch (and first launch after this update) opens the player at 40% of work-area width (height capped at 80% of work area, min width 575), side windows follow its height; later resizes are remembered again.
- Holding forward/rewind (pointer after 400 ms, or key) loops the motor sound until release/cancel/blur/status change; the existing one-shot `seek` sound and seeking still happen; a click plays no motor.
- typecheck, lint, pnpm test, cargo test, clippy pass; CDP check of buttons, playlist and default size.

Non-goals: redrawing buttons (the art is a drop-in on the same 2334x1874 canvas, same key positions), new per-state button art, changing playlist layout/size, volume control for the motor sound, settling the final default size (user decides after testing).

Assets: buttons PNG 2334x1874 RGBA, alpha bbox (485,1428)-(1902,1776) vs old source (485,1428)-(1887,1754): same keys, extra shadow right/bottom. Playlist base 1874x1874 vs old 1874x1885 (old has 11 px transparent top); near-identical design ("Track List" heading). Motor mp3 59.8 s, 44.1 kHz mono.

## Open questions
- [x] Motor sound: loop while held, stop on release; clicks silent. (user)
- [x] Default size: 40% of work-area width "for now, decide after testing". (user)
- [x] Existing saved sizes: reset once after this update (sizes and positions of all three windows). (user)
- [x] Buttons: drop-in, no redraw (same canvas and key positions; measured). (orchestrator)
- [x] Playlist base: replace base layer only, padded to 1874x1885 so nothing else moves. (orchestrator)
- [x] Loop asset: decoder caps sounds at 10 s (sound.rs MAX_SOUND_MS); ship an ~8 s seamless FLAC loop cut from the mp3 (FLAC: no MP3 encoder padding gap at the seam). (orchestrator)

## Contracts
- Rust `player-core/src/output.rs`: keep `play_clip(&mut self, clip: Clip) -> bool`; add `loop_clip(&mut self, clip: Clip) -> bool` (voice restarts at 0 at the end; ignored, returns false, if a voice of the same clip, `Arc::ptr_eq`, is already looping) and `stop_clip(&mut self, clip: &Clip)` (ends every voice of that clip). Commands reach the callback through the existing ring as a small enum; no allocation, locking or logging in the callback. Looping voices count toward MAX_VOICES=4.
- Rust `player.rs`: keep `play_sound(&mut self, name: &str)`; add `loop_sound(&mut self, name: &str) -> Result<(), PlayerError>` and `stop_sound(&mut self, name: &str) -> Result<(), PlayerError>` (unknown name = error, like play_sound).
- Protocol (PROTOCOL.md first, then protocol.rs + protocol.ts + ndjson.ts): `playSound {name, loop?: boolean}` (absent = false); new `stopSound {name}`. No events; unknown name ignored and logged; stop of a silent sound is a no-op.
- `app/src/shared/sounds.ts`: add `motor: 'tape_motor.flac'`; file `assets/audio/tape_motor.flac`; electron-builder extraResources filter also takes `*.flac`.
- `engine/commands.ts`: `playSound(name, loop = false)`, `stopSound(name)`.
- Renderer hold: when a hold starts (`seekOnce` sets `holding`) send `playSound('motor', true)` alongside the existing `playSound('seek')`; when `stop()` ends a hold that had started, send `stopSound('motor')`.
- Main safety: on player renderer gone/reload/close, send `stopSound motor` so a crashed UI can't leave it looping.
- Window size: pure `defaultPlayerSize(workArea: {width,height}, aspect: number, minWidth: number): {width,height}` in new `app/src/main/windowSize.ts`: width = max(minWidth, min(round(0.40*W), floor(0.8*H*aspect))), height = round(width/aspect).
- Settings: `layoutVersion?: number` in `Settings`; `LAYOUT_VERSION = 2`; loading settings whose layoutVersion !== 2 drops `window`, `playlistWindow`, `albumWindow` (keeps `lastOpenDir`); every save writes `layoutVersion: 2`. Pure function, tested.
- Buttons CSS: `.cp-btn` rect = hit area (unchanged); the key art paints from a pointer-events:none layer extended right/bottom by enough design px to include the baked shadow; the synthetic CSS drop-shadow goes.

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Art swap: buttons + playlist base | sonnet | assets/ui/png/body-buttons.png, assets/ui/source/player-body-buttons.png, assets/ui/playlist/playlist-base.png, assets/ui/source/playlist-base.png (new), CassettePlayer.css/.tsx, layout.ts (BUTTONS only), assets/ui/MANIFEST.md, docs/ASSETS_TODO.md | — | PNGs at 2x (1534x1232, 1874x1885); shadow not clipped; states work; typecheck/lint/test |
| 1.2 | Default size 40% + one-time reset (TDD) | sonnet | app/src/main/windowSize.ts (new), app/src/main/index.ts, app/src/main/settings.ts, app/test/windowSize.test.ts, app/test/settings.test.ts (new) | — | red→green tests for size and reset; typecheck/lint/test |
| 1.3 | Engine: looping + stoppable voices (TDD) | sonnet | engine/crates/player-core/src/output.rs, player.rs, tests/player.rs | — | unit tests for loop wrap, stop, duplicate-loop ignore, voice cap; cargo test + clippy |
| 2.1 | Protocol + asset + main plumbing (TDD) | sonnet | docs/PROTOCOL.md, engine-sidecar/src/protocol.rs, main.rs, tests/stdio.rs, app/src/shared/protocol.ts, sounds.ts, app/src/main/ndjson.ts, app/test/ndjson.test.ts, app/src/main/index.ts, app/src/renderer/src/engine/commands.ts, app/electron-builder.yml, assets/audio/tape_motor.flac | 1.2, 1.3 | stdio + ndjson tests for loop/stopSound; seamless ~8 s FLAC; all checks |
| 3.1 | Renderer: motor during hold (TDD) | sonnet | app/src/renderer/src/input/useSeekHold.ts (+ pure helper if extracted), app/test/seekHold.test.ts (new) | 2.1 | test: hold → loop sent once, release/cancel → stop sent, click → nothing |
| 3.2 | Docs | haiku | docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, CLAUDE.md | 2.1 | decisions appended (FLAC loop, loop/stop voices, 40% default + reset); facts match code |
| 4.1 | Live CDP check | sonnet | none (scratchpad only) | 3.1, 3.2 | screenshots of player+playlist; default size on fresh userData; hold sends loop/stop over the wire |

## Log
- Worktree `.claude/worktrees/ui-refresh`, branch `feature/ui-refresh` from dev 59cb98a.
- MAP: none
- Scout (sonnet) gathered buttons/playlist/size/sound facts.
- Approved 2026-11-06 ("go"). Baseline porcelain: `?? docs/plans/2026-11-06-ui-refresh.md`. pnpm install done in worktree.
- W1 launched: 1.1 sonnet (art swap), 1.2 sonnet (size+reset), 1.3 sonnet (engine loop/stop).
- 1.1 reported partial-OK: own checks pass; lint/test failures were 1.2 WIP. Pad right 5, bottom 7.
- 1.2 done: pure code in windowSize.ts (settings.ts imports electron); 5 tests red→green; 52 JS tests pass.
- 1.3 done: Cmd{Play,Loop,Stop} ring, loop_clip/stop_clip, loop_sound/stop_sound; 4 mixer tests + unknown-name test; cargo test+clippy pass. W1 verifier (haiku) + reviewer (sonnet) launched.
- W1 verified: verifier all pass, outside-own none; reviewer no blockers (minors accepted: pressed moves baked shadow; stop_clip ignores full ring; stop_sound may resample on control thread). 2.1 launched sonnet.
- 2.1 done: protocol loop/stopSound, 8.0 s FLAC loop (src 20-28 s, 0.4 s equal-power crossfade, ~-1.1 dB vs rewind_forward), main stops motor on closed/gone/reload; red→green. W2 verifier + reviewer launched.
- W2 verified: all checks exit 0, outside-own none; reviewer no blockers (minors: duplicate closed handler, misplaced doc comment in commands.ts → given to 3.1). W3 launched: 3.1 sonnet, 3.2 haiku.
- 3.1 done: pure createHoldMotor in input/seekHold.ts, hook wires begin/end; 3 tests red→green; 55 JS tests pass. Hook wiring covered by 4.1 CDP check.
- 3.2 done: 4 DECISIONS entries, ARCHITECTURE sound/settings, CLAUDE.md settings line. Electron binary was missing in worktree; ran its install.js. User asked to run the app for manual testing.
- User manual test: buttons OK, playlist OK, motor OK. Size at 40% "bigger than before" → wants 25%. Reports side windows no longer snap to the player.
- Snap: this branch changed no docking code (index.ts diff = defaultPlayerSize call + stopMotor hooks only; dock.ts untouched). Session is native Wayland (XDG_SESSION_TYPE=wayland, no ozone hint), where docking is documented as unavailable (DECISIONS 2026-11-06). Needs a discriminator: does snapping work on dev (main checkout) on this machine?
- Delta approved ("go"). 5.1 haiku launched (25%, MIN_WIDTH 384, LAYOUT_VERSION 3). 5.2: dev build launched from main checkout for user snap test.
- 5.1 done: 25%, MIN 384x308, LAYOUT_VERSION 3; tests red→green, 55 pass. Old 2026-11-01 55% entry left (append-only, superseded).
- 5.2 result: user confirms snapping (follow, re-dock) does NOT work on dev either → pre-existing (native Wayland), not this branch. Deferred by user to a follow-up run after this one. Closed the dev-build app.
- 4.1 + final verify launched.
- Final verify: outside-own none; typecheck/lint/test(55)/cargo test/clippy all EXIT 0.
- 4.1 live CDP: (1) fresh profile 480x386 on 1920 work area = 25% PASS; (2) key caps + shadow PASS (orchestrator viewed player.png); (3) wire: hold → playSound seek + playSound motor loop:true once + seekRelative x5 + stopSound motor on release; short click sends nothing PASS.
- Complete. Tier mix: 8 sonnet builders/reviewers/live-check, 2 haiku builders (3.2, 5.1), 3 haiku verifiers, 1 sonnet scout. No escalations, no VERIFY fixes.
- Follow-ups: side-window docking on native Wayland (pre-existing, user's next run); default size 25% provisional; loop-seam click only judged by numbers + user ear test.
