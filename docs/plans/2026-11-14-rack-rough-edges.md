# Plan: Rack rough edges (follow-ups to 2026-11-14-rack-interactions)
Status: Complete

## Goal / Done when / Non-goals
Goal: fix the four known rough edges:
1. Closing the preview while it is still sliding out makes it jump.
2. The inert preview rows highlight on hover and take focus.
3. The 300 ms preview delay ignores the OS double-click time.
4. A late albumInfo, arriving after the 5 s timeout, bumps Recent.

Use Opus where needed. TDD.

## Open questions
- [x] Double-click time: main reads the OS setting once at startup, falling back to 500 ms. Windows: `reg query "HKCU\Control Panel\Mouse" /v DoubleClickSpeed`. macOS: `defaults read -g com.apple.mouse.doubleClickThreshold` (seconds). Linux: on KDE `kreadconfig6`/`kreadconfig5 --group KDE --key DoubleClickInterval`, otherwise `gsettings get org.gnome.desktop.peripherals.mouse double-click`. Clamped to 150-1000 ms. Uses execFile, no shell.

## Contracts
MAP: none

Rough split (A/B/R):
- T-slide: switch the preview from keyframes to a CSS transition (reverses mid-way) (1/1/1)
- T-rows: inert TrackRows render non-focusable, no hover (0/1/0)
- T-dbl: main reads the OS double-click time, IPC to the rack, which uses it as the preview delay (2/2/1 → split or settle)
- T-late: scanWaiter counts outstanding preview scans per path; a late answer is still consumed; reset on sidecar restart (1/1/2)

## Contracts (fixed)
- `app/src/main/dblclick.ts`: `parseDoubleClickMs(platform: NodeJS.Platform, kind: 'reg'|'defaults'|'kde'|'gsettings', stdout: string): number | null` (pure, clamped 150-1000) and `readDoubleClickMs(): Promise<number>` (execFile with a 2 s timeout, fallback 500).
- `RetroApi.doubleClickMs(): Promise<number>`, IPC `os:doubleClickMs` (handle; main caches the value read at startup).
- `rackClick.ts`: `PREVIEW_DELAY_MS` becomes the 500 fallback. RackView uses the IPC value once it resolves.
- `scanWaiter`: tracks `owed` per path (scans it sent that are still unanswered). `answer(path, album)` returns true while owed > 0 (decrements it, and settles any pending request), even after a timeout. A new `reset()` zeroes owed and settles pending requests with null, and is called when the sidecar restarts.
- TrackRows without `onRowClick`: the rows are non-focusable (div or tabIndex -1), show no hover highlight and use the default cursor. The playlist rows are unchanged.
- Preview slide: a CSS transition on the open state (it reverses from wherever it is), not keyframes. It unmounts on transitionend of the close, with a timeout fallback, and reduced motion has no transition.

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Slide via transition (edge 1) | sonnet | RackView.tsx, RackView.css | — | closing mid-open reverses smoothly; always unmounts |
| 1.2 | Inert preview rows (edge 2) | haiku | TrackRows.tsx, TrackRows.css | — | no hover/focus without onRowClick; playlist unchanged |
| 1.3 | Late answer never bumps Recent (edge 4) | opus | main/rackTracks.ts, test/rackTracks.test.ts, main/index.ts | — | tests: late answer consumed, a second rackAdd scan still recorded, reset |
| 2.1 | OS double-click time (edge 3) | opus | main/dblclick.ts, test/dblclick.test.ts, main/index.ts, shared/api.ts, preload/index.ts, RackView.tsx, rackClick.ts, test/rackClick.test.ts | 1.1, 1.3 | parser tests per OS; the rack waits the OS time |
| 2.2 | Docs (DECISIONS) | haiku | docs/DECISIONS.md | 2.1 | the entry records the OS read and fallback |

## Log
- 2026-11-14 Grilling started. MAP: none.
- Approved ("go ahead"). Baseline: the uncommitted rack-interactions work (12 modified files and the new rack files), plus .scratch/ and the 3 untracked assets dirs. Use `git diff --stat` deltas against that, per Own.
- Sidecar restart: the Sidecar emits `error {code: 'engine_crashed'}` through the event callback (sidecar.ts:54), so reset() hooks there.
- Wave 1 launched: 1.1 sonnet, 1.2 haiku, 1.3 opus.
- 1.2 haiku done: inert rows are divs with an `inert` class, no hover; the test failure belonged to 1.3 mid-TDD (w.reset missing).
- 1.1 sonnet done: a transition with an `open` class set by a double rAF; unmount on transitionend plus a 300 ms fallback; keyframes removed. Its test failure is 1.3's in-progress file.
- 1.3 opus done: an owed count per path, reset() on engine_crashed, 3 new tests; the old timeout test was updated (it asserted the bug). 247 pass.
- VERIFY fix 1.1 (2 lines): reset `opened` on unmount so re-opening the same spine slides in again. typecheck, lint and test (247) pass; no changes outside Own (snapshot compare).
- Wave 2: 2.1 opus launched; wave-1 reviewer (sonnet) launched.
- Wave-1 review: no blockers. Minors: the transitionend target check was sent to 2.1; owed can leak if a send is dropped while the engine is down (self-heals; accepted); switching spines mid-close drops the old panel at once (accepted).
- 2.1 opus done: dblclick.ts + 7 tests; PREVIEW_DELAY_MS 500 (fallback); doubleClickMs IPC; RackView uses the OS value via a ref; transitionend target check (addendum). 254 pass. The orchestrator read dblclick.ts (execFile, no shell, fixed args) and ran readDoubleClickMs on this KDE machine: 400 (KDE key empty → gsettings).
- 2.2 haiku docs, final verifier (haiku) and live CDP (sonnet) launched.
- 2.2 haiku done: a DECISIONS entry and a TESTING sentence.
- Final verifier: 254 JS tests, typecheck, lint, build, cargo test and clippy pass; OUTSIDE-OWN none.
- Live CDP a–f PASS. It showed the unmount came from the 300 ms fallback: the addendum's `target === currentTarget` can't match, since the transition runs on the child paper (an orchestrator briefing error). VERIFY fix 2.1 (1 line): check `target.classList.contains('rk-preview-paper')`. The re-run first hit a stale app instance on the same port and profile; after killing it, all PASS and the panel unmounts at about 110 ms via transitionend.
- Close: 2 haiku, 1 sonnet and 2 opus builders (+ haiku verifier, sonnet reviewer, sonnet live tester); no escalations; VERIFY fixes on 1.1 (opened reset) and 2.1 (transitionend target).
