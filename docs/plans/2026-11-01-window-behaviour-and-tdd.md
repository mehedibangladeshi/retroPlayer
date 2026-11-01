# Plan: Window behaviour fixes + TDD guardrail
Status: Verifying (live checks pending: xdotool)
Branch: feature/album-import (worktree), on top of uncommitted album-import + album-window work.

## Goal / Done when / Non-goals
Goal:
1. Playlist and album-art windows never open at app launch; only when needed (album / art arrives).
2. Satellite windows never cover the player: art window on the player's left, playlist on its right, attached.
3. Double-click never toggles full screen (any window); only the keyboard shortcut and the window button do.
4. TDD from now on, with a strong guardrail.
5. Resolve pending decisions (asked during grill).

Done when: (TBD at lock)
Non-goals: (TBD at lock)

## Open questions
- [ ] Root cause of satellites opening at launch (scout).
- [ ] Root cause of satellites opening on top of the player: Wayland ignores client window positions (seen in run 2 E2E). Fix options: force X11/XWayland on Linux, or docking via parent/child, or single-window layout.
- [ ] "Attached": do satellites move with the player when it is dragged (docking)? Earlier decision was first-placement only.
- [ ] Where double-click full screen comes from (app handler vs OS maximize on drag region) (scout).
- [ ] Full screen for satellites: allowed via shortcut? They have no full-screen button.
- [ ] TDD guardrail form: AGENTS.md rule, hooks, CI gate, test-first check.
- [ ] Pending decisions backlog: rounded corners (transparent windows), draggable resize grip, stale-Ended race (epoch), Enter on Tab-focused row, real font file, commit split, DECISIONS.md conflict with main checkout.

### Resolved (grill)
- Wayland: keep; compositor decides positions (accepted limit). No X11 forcing.
- Attach: satellites follow the player while attached; dragging away detaches; dropping within 12 px of the player edge re-attaches.
- No room: nudge the player inward; if the screen is too narrow for all, sides may go partly off-screen but never overlap the player.
- Launch: user saw satellites "right at startup, nothing opened". Code has no such path (scout) → reproduce live first (T7 runs early probe in W1? no: T7 at end + a launch probe in T4's acceptance via test) — fix test-driven if reproduced.
- Full screen: player only (F11 + button); double-click does nothing in any window; satellites never full screen.
- TDD guardrail: AGENTS.md rule + versioned pre-commit hook (enabled by `prepare`). Not: CI on push, Claude hook. Memory saved (tdd-required).
- Backlog all in: stale-Ended race, Enter on Tab-focused row, rounded corners (transparent windows), working resize grip.

## Contracts
MAP: none
TDD for every task: write the failing test(s) first, run them and quote the failing output in the report, then implement until green.

### D1 · `app/src/main/dock.ts` (T1) — pure, no Electron imports
```ts
export interface Rect { x: number; y: number; width: number; height: number }
export type Side = 'left' | 'right'
export const SNAP_PX = 12
export function overlaps(a: Rect, b: Rect): boolean            // positive-area intersection
export function placeSide(player: Rect, size: { width: number; height: number }, side: Side): Rect // flush, top-aligned
export function snapTo(player: Rect, win: Rect, side: Side): Rect // flush x for that side, keeps win.y/size
export function isAttached(player: Rect, win: Rect, side: Side, tol?: number): boolean // |gap| ≤ tol AND vertical overlap > 0
export function follow(win: Rect, from: Rect, to: Rect, side: Side): Rect // keep vertical offset to player top, re-snap to `to`
export function fitAll(player: Rect, sides: Partial<Record<Side, Rect>>, work: Rect): { player: Rect } & Partial<Record<Side, Rect>>
  // sides placed flush (keeping each side's size and its y if it overlaps the player vertically, else player.y);
  // player x shifted (minimally) so player+sides fit inside work horizontally; player y clamped into work;
  // if total width > work width: player centred in work, sides flush (may overflow work) — never overlapping the player.
export function gripResize(start: Rect, dx: number, dy: number, aspect: number, minW: number, minH: number): Rect
  // top-left anchored; width = max(minW, start.width + max(dx, dy * aspect)); height = round(width / aspect) (≥ minH, width re-derived if needed)
```

### D2 · Engine stale-Ended guard (T2)
player-core: `PlayerEvent::Ended { generation: u64 }`; `Player::generation(&self) -> u64` — increments on every successful `load`. Sidecar: `Input::Ended(u64)`; on_ended advances only if `gen == player.generation()` (plus existing guards). Wire `ended` event unchanged (protocol/docs unchanged).

### D3 · Grip IPC (T3 writes types/preload; T4 main handler; T5 renderer)
`api.ts`: `resizeWindow(width: number, height: number): void`, `IPC.resizeWindow = 'window:resize'`. Main: sender must be a satellite window (fromAppWindow + not the player); both finite; apply `gripResize`-equivalent clamping (aspect + min of that satellite) via setBounds keeping x/y; then docking re-snaps if attached.

### D4 · Window rules (T4)
- All three windows: `transparent: true`, `backgroundColor: '#00000000'`, `maximizable: false`; `on('maximize')` → `unmaximize()` (no full screen). Remove the player's maximize→fullscreen conversion. Player keeps F11/Escape and the IPC button. Satellites `fullscreenable: false`.
- Docking via dock.ts: per-satellite `attached: boolean` (in memory). On show: if no saved bounds, or saved bounds overlap the player, or attached → fitAll with that side (may move the player). Player `move`/`resize` → attached satellites follow (follow()). Satellite `move`/`resize` by user (ignore events caused by our own setBounds with a guard flag) → attached = isAttached(); if attached → snapTo.
- Launch: no satellite may be created or shown before an engine `playlist`/`artwork` event with non-null content.

### D5 · Renderer (T5)
- Transparent html/body; each view root gets border-radius matching its art corners (measure from PNG alpha with magick); album CSS frame radius likewise.
- Playlist grip: pointerdown on PLAYLIST.GRIP → pointer capture; on move (rAF-throttled) → `window.retro.resizeWindow(w0 + dx, h0 + dy)` with w0/h0 = window.outerWidth/outerHeight at start, dx/dy from screenX/screenY. Grip no-drag, cursor nwse-resize.
- Enter on a focused row plays THAT row (pure helper `rowKeyAction` tested in app/test).

## Waves
| # | Task | Tier | Own | Depends | Acceptance (tests first) |
|---|---|---|---|---|---|
| T1 | dock.ts pure module | sonnet | app/src/main/dock.ts, app/test/dock.test.ts | — | D1; tests: flush both sides, overlap detection, attach tolerance, follow on move+resize, fitAll nudge left/right edge + too-narrow case never overlaps, gripResize aspect/min |
| T2 | Engine stale-Ended guard | sonnet | engine/crates/player-core/src/player.rs, src/lib.rs, tests/player.rs, engine/crates/engine-sidecar/src/** , tests/** | — | D2; test: stale generation ignored (unit test of the guard function) ; cargo test + clippy |
| T3 | Guardrails + grip API types | haiku | AGENTS.md, CLAUDE.md, docs/DEVELOPMENT.md, scripts/git-hooks/pre-commit, package.json (root), app/src/shared/api.ts, app/src/preload/index.ts | — | hook blocks a failing commit in a scratch clone; prepare sets core.hooksPath; typecheck/lint |
| T4 | Main wiring: docking, maximize, transparency, grip IPC, launch rule | sonnet | app/src/main/index.ts, app/src/main/settings.ts | T1, T3 | D3/D4; pure parts covered by T1 tests; typecheck/lint/test/build |
| T5 | Renderer: rounded corners, grip drag, Enter fix | sonnet | app/src/renderer/index.html, app/src/renderer/src/views/*.css, PlaylistView.tsx, AlbumView.tsx, CassettePlayer.tsx (only if needed for radius), app/src/renderer/src/views/rowKeys.ts, app/test/rowKeys.test.ts | T3 | D5; rowKeys test first; typecheck/lint/test/build |
| T6 | Docs ARCHITECTURE, DECISIONS | haiku | docs/ARCHITECTURE.md, docs/DECISIONS.md | T1–T5 | decisions recorded |
| T7 | Live E2E (X11 + Wayland launch) | sonnet | scratchpad | all | launch: no satellites; attach/follow/detach/re-attach; never overlaps; nudge; double-click no-op; grip; rounded corners screenshot; Enter; stale-race covered by T2 test |

## Log
- 2026-11-01 new run.
- Approved ("ok"). Baseline run3-files/run3-hashes in scratchpad. Wave 1: T1 sonnet, T2 sonnet, T3 haiku.
- T1 done (RED module-missing → 26/26 green); review minors only (extra edge tests possible).
- T2: review blocker (gen bumped before worker switch) → retry (sonnet) moved bump into worker Load under lock (player.rs:554, read :707); simplified sidecar Work enum. Accepted.
- T3 partial: rule+hook+prepare+docs+api done; hook demo in scratch clone blocked by git guard/classifier (not bypassed) → final verifier tests hook failure path inside worktree.
- Wave 2 launched: T4 sonnet, T5 sonnet.
- T4 done; T5 done (RED→30 green); T6 done.
- Review T4/T5: T4 blockers (fullscreen follow offset; satellite shown over fullscreen player) + minors → T4 retry (sonnet). T5 minors → T5-fix (haiku, test-first).
- T4 retry + T5-fix done. Final suite green; hook probe EXIT=1 ("JS tests failed"); outside-Own none.
- T7 partial: pass 1 (no satellites at startup, Wayland+x11, second instance), 2 (flush placement), 7 (fullscreen via IPC hides/restores, no shift), 8 (grip), 10 (Enter), 11 (settings restored). NOT VERIFIED (no xdotool/wmctrl): 3 follow, 4 detach/re-attach, 5 nudge, 6 real double-click, F11 key, corner alpha of side windows.
