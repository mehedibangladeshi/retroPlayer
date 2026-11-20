# Plan: window lock, clear rack, chrome scaling, 2px gap (items 17–20)
Status: Complete

## Goal / Done when / Non-goals
Goal: implement items 17–20 of the user's 2026-11-20 brief: universal window lock/unlock (#17), clear all
cassettes with confirmation (#18), fixed-size shared window chrome independent of window size (#19), 2px
transparent gap between attached windows (#20).
Done when: every item implemented or documented as blocked; typecheck, lint, pnpm test, cargo test, clippy pass;
dock E2E passes; UI checks driven over CDP where possible.
Non-goals: new artwork, player chrome changes, rack/playlist interior changes, persisting docks.
Commits: user wants one commit per task (2026-11-20). Plan: commit each task right after its wave verifies, because index.ts/dock.ts are shared across waves; Approved 2026-11-20: commit every task via /git-commit right after its wave verifies, in task order, no per-message approval needed, no AI attribution.

## Open questions
Scout facts, rack (2026-11-20):
- Per-album resume lives on RackEntry.resume in rack.json (main only). Global Session {path, album, index, positionMs} in settings.json, rewritten on every state event.
- foldResume returns f unchanged when the album has no entry, so after a remove no progress is re-created; record() on playlist/albumInfo re-adds the entry (a re-import starts fresh).
- Single remove exists: rack:menu → rackMenuTemplate(sort, hasDir, actions) (rackIpc.ts:16) → setRack(remove(...)). An empty-shelf right-click sends null (sort radios only).
- No confirmation dialogs exist yet. Count is in rk-count, in the title bar.
- Race: rackPlay awaits previewScans and then uses the captured resume plan.

Scout facts, windows (2026-11-20):
- 5 windows, all frame:false + transparent:true + backgroundColor #00000000. Player 767x616 with an aspect lock. Satellites: playlist (free), album (aspect), rack (free), power (aspect).
- A dock tree already exists (dock.ts Dock{to,side,ratio}, subtree, layout, snap, snapResize, fillGaps, inferDocks). Moving the player moves its subtree (followPlayer → sync). Dragging a docked satellite tears it off. Docks are not saved; they are rebuilt with inferDocks(tol=1). SNAP_PX=12, everything flush, no gap constant.
- Moves are OS-driven (-webkit-app-region). Main tells its own moves apart with programmatic/isOwn.
- Player: the whole body drags (.cp drag, buttons no-drag). Satellites: exactly one childless strip, enforced by dragRegions.test.ts (WINDOWS.md side rule 5).
- #19 root cause: each view is one fixed design composition inside transform: scale(fit.scale), with the title bar inside it. The title text, icons and frame are baked into *-top.png / body PNGs, so they scale with the window, and each window has its own scale. The playlist TitleText and .rk-count also scale. The free windows use nineSlice with Math.round(v*scale) edges. The existing fixed-screen-size pattern is the playlist rows: textMetrics divides TEXT_PX by scale.
- Rules to change: side rule 5 (drag region), docking rule 3 (snap flush), docking rule 4 (tear off), side rule 4 (player resize doesn't resize others) when locked.

Design tree:
- [x] #17 Lock can only be turned on when every open window is attached (the toggle is disabled otherwise).
- Assets: no window has its title text or icons as a separate layer. Icons and frames are baked into full-canvas *-top PNGs. The playlist title (TitleText) and the rack count are drawn in code; "CASSETTE RACK" is baked. The player has no title bar, only min/close in body-top-cover.png. Album and power have no title text. Bar heights in design px: playlist 74.5, album 62, rack 64, power 48.
- [x] #19 slice the art in code: each side window's top band and outer border are drawn at one shared fixed CHROME_SCALE (~0.55, icons ~16 DIP) and only the interior scales. Code-drawn titles get a fixed size.
- [x] #19 the player stays as it is (its bezel is product art, not chrome).
- [x] #17 rule changes approved for locked mode: no tear-off, the whole group moves; resizing any window scales the group about its top-left (clamped to min/max, gaps kept unscaled); album and power interiors drag, with no-drag carve-outs on their controls; rack and playlist stay strip-only. Unlocked works as today.
- [x] (default) Lock toggle: a "Lock windows" checkbox in the player menu's Windows submenu, disabled unless every open window is attached. Persisted as settings `windowsLocked`, broadcast to every window.
- [x] (default) Clear: "Clear cassette rack…" in the rack's right-click menu, disabled when the rack is empty; native showMessageBox with Cancel/Clear All, Cancel as default.
- [x] (default) #20: GAP=2 DIP in the dock math; inferDocks accepts flush (0) or 2 px, so old saved layouts re-dock and get the gap; no LAYOUT_VERSION bump.
- [x] #18 clear also drops the global session; the session is not saved while the playing album has no rack entry.

## Contracts
- MAP: none (hook-injected symbol list only)
- dock.ts: `export const GAP = 2` (DIP). place/snap/snapResize/fillGaps/layout leave GAP between docked windows; sideOf/inferDocks treat 0..GAP+1 px apart as attached.
- app/src/shared/chrome.ts: `export const CHROME_SCALE = 0.55`; `export const chromeBarPx = (barH: number) => barH * CHROME_SCALE` (fixed DIP height of a side window's top bar). Shaded height = chromeBarPx(SHADE[w].barH), whatever the window size.
- Aspect side windows (album, power): the window is split at design y=barH. The top band is drawn at CHROME_SCALE; the body [barH..designH] scales by s = winW/designW. Aspect rule: winW / (winH - chromeBarPx(barH)) = designW / (designH - barH).
- settings.json `windowsLocked?: boolean`. IPC `window:locked` (push, boolean) + `window:getLocked` (invoke). RetroApi `getLocked(): Promise<boolean>`, `onLocked(cb: (locked: boolean) => void): () => void`. Renderer hook `useLocked(): boolean` in app/src/renderer/src/useLocked.ts.
- contextMenu Windows submenu: checkbox "Lock windows" {checked: locked, enabled: canLock || locked} → action toggleLock().
- rack.ts `clear(f: RackFile): RackFile` (keeps sort, empties entries). rackMenuTemplate gains action `clear` and item "Clear cassette rack…" (enabled iff entries > 0) in both branches.
- groupResize (3.1) signature is fixed by 3.1's report and pasted into 4.1.

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | #20 2px gap in dock math (A1 B1 R1) | sonnet | app/src/main/dock.ts, app/test/dock*.test.ts, scripts/e2e/dock.mjs | — | tests show GAP between snapped/placed/filled windows; flush+2px both infer docks; pnpm test |
| 1.2 | #18 clear rack: clear(), menu item, confirm dialog, drop session, no session save for the cleared playing album until re-import (A1 B2 R1) | sonnet | app/src/main/{rack.ts,rackIpc.ts,index.ts,session.ts}, app/test/{rack,rackIpc,session}.test.ts | — | Cancel changes nothing; Clear empties rack.json + count + session; playback untouched; pnpm test |
| 1.3 | #19 chrome.ts constant + fixed shaded bar height (A0 B1 R1) | haiku | app/src/shared/chrome.ts, app/src/shared/shade.ts, app/test/shade*.test.ts, app/test/chrome.test.ts | — | shadedBounds bar height independent of window scale; pnpm test |
| 2.1 | #19 playlist + rack: top band and nine-slice borders at CHROME_SCALE, title/count fixed px (A1 B2 R1) | sonnet | PlaylistView.tsx/.css, RackView.tsx/.css, stretchFit.ts, TitleText.tsx, playlistText.ts, related tests | 1.3 | bar/border/title px equal at 2 window sizes (pure test of the fit math); typecheck, lint, test |
| 2.2 | #19 album + power: split top band at CHROME_SCALE, body scales (A2 B1 R1) | sonnet | AlbumView.tsx/.css, PowerView.tsx/.css, new pure helper + test | 1.3 | bar px fixed, body fills the window under the contract aspect; typecheck, lint, test |
| 2.3 | #19 main: aspect with fixed bar extra (setAspectRatio extraSize on macOS, equivalent on Win/Linux), limits, shade wiring (A1 B1 R2) | sonnet | app/src/main/index.ts, app/src/main/windowSize.ts, app/test/windowSize.test.ts | 1.3 | pure aspect-size fn tested; album/power keep the contract aspect while resizing |
| 3.1 | #17 groupResize pure fn: scale every window in the group by one factor, clamp to all limits, relayout via the dock tree with GAP unscaled (A1 B0 R2) | sonnet | app/src/main/dock.ts, app/test/dock*.test.ts | 1.1 | tests: gaps stay 2, clamped by the tightest limit, arrangement preserved |
| 3.2 | #17 lock plumbing: settings key, IPC/api/preload, menu checkbox, useLocked hook (A0 B2 R1) | sonnet | settings.ts, shared/api.ts, preload/index.ts, contextMenu.ts, renderer/src/useLocked.ts, tests | — | settings parse round-trips; menu item checked/enabled per inputs; typecheck, test |
| 4.1 | #17 main wiring: lock state + broadcast + persist/restore, satellite drag moves the group, no tear-off, group resize, keep on screen on display change (A1 B1 R2) | sonnet | app/src/main/index.ts (+ small pure helper + test) | 2.3, 3.1, 3.2 | dock E2E passes; locked moves/resizes keep gaps (CDP check in 5.2) |
| 4.2 | #17 album/power locked drag surfaces with no-drag carve-outs; dragRegions test updated (A1 B2 R1) | sonnet | AlbumView/PowerView (.tsx/.css), app/test/dragRegions.test.ts | 2.2, 3.2 | test allows drag/no-drag only under .locked; unlocked unchanged |
| 5.1 | Docs: WINDOWS.md, DECISIONS.md, ARCHITECTURE.md for 17–20 | haiku | docs/WINDOWS.md, docs/DECISIONS.md, docs/ARCHITECTURE.md | all | rules match the code |
| 5.2 | Live CDP check: chrome px at 2 sizes, 2px gap, locked move/resize, clear rack while playing (no code) | sonnet | scratchpad only | 4.1, 4.2 | report with measured numbers |

## Log
- 2026-11-20 approved. Baseline porcelain: ?? assets/ui/all basic cassette/, ?? assets/ui/source/album cover deck/, ?? assets/ui/updated send 9-11-26/, ?? this plan file.
- Wave 1 launched: 1.1 sonnet, 1.2 sonnet, 1.3 haiku.
- 1.3 partial: shadedBounds is in app/src/main/shade.ts (contract error). Own extended, agent resumed.
- 1.2 done (own tests green; the other failures are 1.1/1.3 in progress). rackMenuTemplate(sort, hasDir, count, actions); shouldSaveSession(nowPlaying, clearedAlbum).
- 1.1 done (GAP=2, sideOf tol GAP+1; TDD order deviation reported: tests written after code). Docs WINDOWS.md 57/87 'flush' go to 5.1.
- 1.3 done after Own extension (main/shade.ts; eslint-disable for unused designH).
- MAP update: the user added graphify to CLAUDE.md mid-run. MAP: graphify — `graphify query "<q>"`, `graphify path "A" "B"`, `graphify explain "X"` (fresh as of wave 1). The user's CLAUDE.md edit and graphify-out/ are not ours; never commit them.
- Wave 1 verify: verifier haiku + reviewer sonnet (1.1, 1.2) launched.
- Wave 1 verified: verifier all pass (292 tests, clippy ok). Reviewer: no blockers. Minor, accepted: a clear during the startup restore before `playlist` arrives can re-record the album; the dialog count can be stale; sideOf tol also accepts up to 3 px of overlap.
- Commits: 68399ba (1.1), 830af12 (1.2), 863f6fc (1.3). The user is adding graphify hooks, .gitignore and .gitattributes concurrently; those are not ours.
- Status → Executing (wave 2).
- Wave 2 launched: 2.1, 2.2, 2.3 (all sonnet). 2.3 also owns shared/chrome.ts for the aspect helpers.
- 2.1 blocked: the nine-slice bands hold the paper, cover and text-area edges, so a fixed frame with a scaled interior misaligns. User decision: playlist and rack are drawn entirely at the fixed CHROME_SCALE; resizing shows more area. 2.1 resumed with that.
- 2.3 done: extraH threaded through windowSize, lockAspect (macOS extraSize). Rejected the Win/Linux "no live lock" part; resumed to keep a live whole-window aspect, refreshed per size, plus the resize-end correction.
- 2.2 done: splitFit; album outline fixed at 0.55; power side/bottom border is baked into power-base and still scales (limitation, document it in 5.1); the power title text shrinks into the fixed bar. Needs a live visual check (5.2). TDD order deviation (helper and tests written together).
- 2.3 done (retry): wholeAspect(h, aspect, extraH); live lock on Win/Linux, refreshed in programmatic() and keepProportion. Small drift during a long drag, re-locked at resize end.
- 2.1 done (fixed scale), but it clips below design*0.55 (515x515 / 893x515 min). Resumed: shrink to the nine-slice minimum, enforce free-window mins in main (Own +windowSize.ts, index.ts).
- 2.1 done (retry 2): FREE_MIN_COMP in new shared/freeMin.ts (outside Own, accepted). Min playlist 220x187, rack 330x161 DIP. Wave 2 verify: verifier haiku, reviewer sonnet, live CDP check sonnet launched.
- Wave 2 verifier: pass (309 tests, build ok). Reviewer: no blockers. Minors: resize-end jump on Win/Linux; proportional(snapped, cur) may nudge the gap by a few px for album/power edge snaps; defaultPlayerHeight uses the whole aspects; free max still capped at design height. Waiting for the live check.
- Live check: bar, button and title px constant (playlist bar 41, rack 35, album 34, power 26; buttons 16-17); player still scales. Defects: the power title is garbled or clipped in the bar → 2.2 resumed; the playlist min clips the empty-state 'Open album' button → 2.1 resumed. Screenshots: scratchpad/live2/.
- 2.2 fix: the power title is now an <img> (resampling suspected). 2.1 fix: mins playlist 220x218, rack 330x178. 310 tests pass. Live re-check launched.
- Live re-check: the power title is legible, the playlist empty state fits at 220x218, the rack at 330x178 is fine (preview panel not checked: no cassettes in the throwaway profile).
- Wave 2 commits, split by layer because index.ts/windowSize.ts were shared by 2.1 and 2.3: ff7bd3c (2.3 + 2.1 main mins), c86f982 (2.2), 6351264 (2.1 renderer).
- Status → Executing (wave 3).
- Wave 3 launched: 3.1 groupResize(rects, docks, rules, resized, next) with SizeRule{aspect, extraH, limits}; 3.2 lock plumbing (both sonnet).
- 3.2 done: contextMenu(windows, toggle, actions{reset, fillGaps, toggleLock?}, boost, locked=false, canLock=false); parseLocked in contextMenu.ts; main must handle IPC.getLocked and push IPC.windowLocked.
- 3.1 done: groupResize; sizes rounded before layout; the anchor is the bbox top-left (next's position is ignored); a missing rule throws. Wave 3 verifier + reviewer launched.
- Wave 3 verifier pass (316). Reviewer: 3.1 BLOCKER, a matched-size child can leave its limits (the f-clamp ignores it) → retry 1 (resume). 3.2 minor: useLocked race + missing catch → resumed.
- 3.2 race fix done. Commit blocked by the pre-commit hook: 3.1's red TDD test is in the working tree. Commit after 3.1 lands.
- 3.1 retry done (bisected f over the full sizing; 319 tests). Committed 3.2 and 3.1 (hook passed). Status → wave 4.
- Commits df13af5 (3.2), bc60be3 (3.1). Wave 4 launched: 4.1 main lock wiring (index.ts + lock.ts), 4.2 album/power locked drag surfaces (both sonnet).
- 4.2 done: red first, 325 pass. Drag on .al-body/.pd-body when locked; no-drag carve-outs for buttons, inputs, .pk-hit, .ps, .pvis. Risk: a window-level file drop may be swallowed on Windows over drag areas.
- 4.1 first pass done (lock.ts, resize at resize end, settle skipped when locked). Resumed for: openbox bogus-move guard, the same window set for player and satellite drags, no single-window clamp on a display change.
- 4.1 retry done (isJump >200 px + 50 ms confirm, one lockedDrag path except macOS player sync, group clamp in applyLimits; 331 tests). Wave 4 verifier, reviewer and live check 5.2 launched.
- Wave 4 verifier pass (331, cargo, clippy). Reviewer: 4.1 BLOCKERS (hidden anchor breaks gaps on a locked resize; onDisplays double fit on stale bounds) + minors (fast-drag lag, lock toggled mid-resize) → retry 1. 4.2: no findings.
- 4.1 retry 1 done: visibleDocks re-anchor, applyLimits→bool, jumpConfirmed (two consecutive jumps within 200 px), setLocked keeps a pending resize. 333 tests. Accepted the deviation in (3).
- Live 5.2 (pre-retry build): gaps exactly 2 everywhere, including the 3-window junction. Lock via settings: group move and resize keep 2 px gaps; unlock moves one window; persistence ok. Not checked: the real menu toggle, a real mouse drag, the clear-rack dialog (no xdotool). Dock E2E: 22 FAILED / 103 PASS. Log at scratchpad/live5/e2e.log. Triage task 4.3 launched.
- 4.2 committed. 4.1 commit waits for the E2E triage.
- 5.1 done: WINDOWS.md (gap rule 10, Chrome scale and Window lock sections), ARCHITECTURE.md, 4 DECISIONS entries. The 'why' for the gap and clear-session entries is inferred; flag it to the user. Commit after 4.3.
- 4.1 committed. 4.3: 120/126 E2E pass; 6 regressions from 1.1's gap: snapResize touchX/touchY inclusive overlap (dock.ts:176) no longer sees neighbours 2 px apart; real drag lands the rack flush (gap 0) after a drop/fit at the work-area top. Fix task 4.4 launched.
- 4.4 partial: snapResize touch tol GAP+1 (test red→green); syncKeepTop in followPlayer (pushes the player down when the group would cross the work-area top). E2E 124/126; the remaining 2 are stale expectations → 4.3 resumed for them.
- 4.3 done: dock.mjs expectations for the bar-aspect album snap and the tile area minus GAP strips. E2E 125/126; 'follow during the drag' at 77% (<80%) → 4.4 retry 1.
- 4.4 retry: no app change possible (WM top-edge clamp for about 40 ms per bump; every app follow is gap-exact). User decision: sample the E2E drag off the top edge, keep 80% → 4.3 resumed.
- 4.3 done: E2E 126/126 on two fresh runs (follow samples taken clear of the work-area top, per the user). Commits d9ae429 (4.4), ad33ad6 (4.3), plus the docs commit (5.1).
- CLOSE: tier mix as built: 2 haiku (1.3, 5.1) + 13 sonnet (incl. 4.3, 4.4 added and the 5.2/live checks). Escalations/retries: 1.3 (Own error), 2.1 x2 (art blocked → user decision; min sizes), 2.2 (power title), 2.3 (live lock), 3.1 (limits blocker), 3.2 (race), 4.1 x2 (review blockers), 4.4 (follow ratio → user decision). No orchestrator code fixes.
- Not verified: Windows/macOS (lock, aspect extraSize, drag regions over file drops), the clear-rack native dialog and the Lock Windows menu click (no xdotool), a real mouse drag in lock mode, a lock toggled mid-resize, the rack preview panel at the minimum size.
