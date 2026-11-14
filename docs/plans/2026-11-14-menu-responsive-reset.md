# Plan: Right-click anywhere, screen-relative window sizes, tiling, Reset Windows / Fill Gaps
Status: Complete

## Goal / Done when / Non-goals
Goal: (1) a right-click anywhere on the player opens the menu; (2) window size limits fit small (12", 720p) and large screens; (3) Windows submenu gets "Reset Windows" that restores default arrangement, sizes and positions; (4) tiling: users arrange windows as tiles into perfect rectangles (also with 2-3 closed): resize-end edge snapping, both-end align on drop, looser free-window sizes, and Windows > Fill Gaps.
Done when: (1) a real right-click on the player body opens a menu that stays open until dismissed (E2E red before, green after; Linux local); (2) min/max/default sizes follow the per-display formula (unit-tested at 720p..4K), applied per window's display and re-applied on display changes; E2E limit checks derive from the work area; (3) Windows > Reset Windows restores the first-launch layout (all shown, unshaded, default sizes, default docks, group on screen), E2E-checked; typecheck, lint, pnpm test, full dock E2E pass locally.
Non-goals: discrete Winamp-style size steps; a user setting for the fractions; persisting size as a ratio of the work area; menus on side windows.

## Open questions
- [x] Q1 right-click: regression from 61b820d on Linux `pnpm dev` (X11): worked before. Cause (hypothesis): oncePerClick keeps the first event, `system-context-menu` (fired on press); that menu closes on release. Fix direction: show only from the page `context-menu` (fires on all three OSes per CI 43579693565), `system-context-menu` only preventDefault; drop oncePerClick. E2E must show a real menu and require it to stay open until Escape (menu-will-show/close timing).
- [x] Q2 sizing (approved, from research: GNOME HIG 1024x600 min display, MS 1366x768 common, Electron DIP workArea + display events): H = workArea.height of the window's display. minH = clamp(round(0.30H), 200, 308); maxH = max(minH, min(round(0.90H), 2*designH)); widths from aspect (free windows same range). Default player height: group (album 1 + player 767/616 + playlist 1 + power 451/934 wide = 3.728h; rack+player = 2h tall) fits 75% of the work area, clamped to the player's range. Re-check on display-metrics-changed, display-added/removed and a window's move ending on another display; out-of-range windows clamp (aspect kept, free per dimension) and stay docked. WCAG 24px floor not applicable (art chrome 30/937 design px).
- [x] Q3 reset: full reset = first launch. All four side windows shown, unshaded, default sizes, DEFAULT_DOCKS, group placed on the player's display; hiddenWindows cleared. (default) No confirm dialog: an explicit menu item.
- [x] Q5 tiling (user): snap edges at resize end; on drop align the start or end edge (closer, within 12 px); free windows (playlist, rack) min width = min height = minH; Windows > Fill Gaps (on demand): within the player's group bounding box, each visible free window grows into empty space (right, down, left, up) until another window or the box edge, within limits; aspect windows untouched. (default) resize snapping at resize end on all OSes (will-resize is Windows/macOS only).
- [x] Q6 user: use opus for sub-agents where needed (overrides the skill's haiku/sonnet-only rule).
- [x] Q4 covered by Q2 default (group fit); side windows still open at player height.

## Contracts
- windowSize.ts (T2): `export interface Area { width: number; height: number }` ·
  `heightRange(area: Area, designH: number): { minHeight: number; maxHeight: number }` ·
  `displayLimits(aspect: number, area: Area, designH: number, free = false): Limits` (widths = round(h*aspect); free: minWidth = minHeight) — added next to the old `sizeLimits(aspect)`, which 2.1 removes after switching callers ·
  `defaultPlayerHeight(area: Area, groupW: number, groupH: number): number` (groupW/groupH = group extent in player heights; result = round(min(0.75*area.width/groupW, 0.75*area.height/groupH)) clamped to heightRange(area, 616)). MIN_H/MAX_H constants removed. dock.mjs may import these from '../../app/src/main/windowSize.ts' to compute expected limits.
- contextMenu.ts (3.1): `contextMenu(windows, toggle, actions: { reset: () => void; fillGaps: () => void })`; Windows submenu = the window checkboxes, a separator, `Reset Windows`, `Fill Gaps`.
- dock.ts (1.3, pure): `snapResize(cur: Rect, from: Rect, others: Rect[], aspect: number | null, l: Limits): Rect` (moved edges snap to parallel edges within SNAP_PX whose ranges overlap; aspect: the most-changed dimension leads) · `snap` also aligns the end edge when closer than the start (within SNAP_PX) · `fillGaps(rects: Record<string, Rect>, free: string[], limits: Record<string, Limits>): Record<string, Rect>` (only changed free windows returned). `Limits = { minWidth; minHeight; maxWidth; maxHeight }`. (T1 removes `oncePerClick`.)
- index.ts menu wiring (T1): `webContents 'context-menu'` shows the menu; `system-context-menu` only `preventDefault()`.
- index.ts (T3): `applyLimits()` recomputes every live window's limits from its display and clamps; Satellite min/max fields become per-display (mutable).
- index.ts (3.1): `resetWindows()`, `fillGaps()` menu actions. (4.1): resize end runs `snapResize` before `keepProportion`/sync.

## Waves
| # | Task | Tier (A/B/R) | Own | Depends |
|---|---|---|---|---|
| 1.1 | Right-click regression: E2E real-menu check (red first), show from context-menu only, drop oncePerClick | opus 1/2/2 | app/src/main/index.ts, app/src/main/contextMenu.ts, app/test/contextMenu.test.ts, scripts/e2e/dock.mjs | — |
| 1.2 | Per-display size formulas + looser free limits (pure, TDD) | sonnet 1/1/1 | app/src/main/windowSize.ts, app/test/windowSize.test.ts | — |
| 1.3 | Tiling geometry: snapResize, end-edge align in snap, fillGaps (pure, TDD) | opus 1/1/2 | app/src/main/dock.ts, app/test/dock.test.ts | — |
| 2.1 | Wire per-display limits, defaults, display-change re-check; E2E limits from work area | opus 1/2/2 | app/src/main/index.ts, scripts/e2e/dock.mjs | 1.1, 1.2 |
| 3.1 | Menu: Reset Windows + Fill Gaps actions, unit + E2E | sonnet 1/2/1 | app/src/main/contextMenu.ts, app/test/contextMenu.test.ts, app/src/main/index.ts, scripts/e2e/dock.mjs | 1.3, 2.1 |
| 4.1 | Resize-end edge snapping wiring + E2E (resize snap, both-end align on drop, tile a rectangle with 2 windows closed) | sonnet 1/2/1 | app/src/main/index.ts, scripts/e2e/dock.mjs | 3.1 |
| 4.2 | Docs: WINDOWS.md (rule 8 limits, tiling/snap rules, reset, fill gaps), DECISIONS x4, ARCHITECTURE | haiku 0/1/0 | docs/WINDOWS.md, docs/DECISIONS.md, docs/ARCHITECTURE.md | 3.1 |

## Log
- MAP: none
- Research agent (sonnet) launched: responsive window sizing best practices.
- Baseline: dev at 61b820d (2 commits unpushed); free-resize work uncommitted in the tree.
- Approved 2026-11-14 ("/reflect -> /git-commit -> then go ahead", with tiling scope and opus where needed). Reflect: WINDOWS.md `free` field. Free-resize work committed 9ebac7f (not pushed).
- Baseline (wave 1): `git status --porcelain` = `?? docs/plans/2026-11-14-menu-responsive-reset.md` plus the untracked designer folders under assets/ui/.
- W1 launched: 1.1 opus (right-click), 1.2 sonnet (sizing), 1.3 opus (tiling geometry).
- 1.2 sonnet done: heightRange/displayLimits/defaultPlayerHeight + tests (red→green, 22 pass). Awaiting 1.1, 1.3 for wave verify.
- 1.3 opus done: snapResize, fillGaps, snap end-align + 13 tests (red→green, 30 pass). Notes: aspect mode returns cur when leading dim has no target; fillGaps bbox from original rects.
- Review 1.2/1.3: no blockers. 1.3 minors sent back (integer sizes in aspect snapResize, overlapping obstacle in fillGaps, tests for left/up/maxHeight). Accepted: duplicate Limits type (dock.ts vs windowSize.ts) — 2.1 may import one.
- 1.3 follow-up done (red 2 → green, 35 pass): integer aspect sizes; overlapping rect blocks all growth. Accepted.
- 1.1 opus partial→done: hypothesis confirmed (system-context-menu popup closed after 5 ms on Linux X11); new E2E 'the menu stays open' red→green; context-menu only; oncePerClick + E2E sleeps removed. Its green run had 2 'bottom:' snap failures, suspected from 1.3's snap end-align (dock.ts changed mid-run). Wave-1 verifier launched (haiku) incl. full E2E.
- Wave-1 verify: OUTSIDE-OWN none; typecheck/lint/test (192) pass; E2E 3 FAIL: 2 'bottom:' = test drop offset 90 put the end edge 10 px from alignment (new approved rule end-aligns) → VERIFY fix 1.3 (3 lines in dock.mjs: offset 110). 'menu stays open' flaky (close 60 ms after show; passed in 1.1's run) → back to 1.1 builder.
- 1.1 follow-up (opus): flake not reproduced (0/110 failures; release hypothesis refuted; an open menu closes when another window takes focus). Added focus/blur + mouse diagnostics to the E2E check. Accepted as is. Re-verify launched (haiku, full E2E).
- Wave 1 VERIFIED (re-verify): OUTSIDE-OWN none; typecheck, lint, test 192, build, full E2E ALL PASS.
- W2 launched: 2.1 opus (per-display limits wiring). Own adds windowSize.ts/test (remove old sizeLimits/defaultPlayerSize, add clampToLimits).
- 2.1 opus done: clampToLimits (red→green), displayLimits per display, defaultPlayerHeight, applyLimits on display events + settle display change; old sizeLimits/defaultPlayerSize removed; E2E limits from work area, 107 PASS. Not live-tested: real display change. Wave-2 verifier (haiku) + reviewer for 1.1+2.1 (sonnet) launched.
- Review 1.1/2.1: no blockers. Minors accepted; coverage gap (no live display-change clamp test) → added to 3.1: E2E fakes a smaller display (patch screen.getDisplayMatching/getPrimaryDisplay in main, emit display-metrics-changed), checks clamp + still docked, then restores.
- Wave 2 VERIFIED: OUTSIDE-OWN none; typecheck, lint, test 190, build, no 308/924 literals in E2E, full E2E ALL PASS.
- W3 launched: 3.1 sonnet (Reset Windows + Fill Gaps + display-change E2E).
- 3.1 sonnet done: menu Reset Windows + Fill Gaps (red→green), resetWindows/fillGapsAction/saveRects, E2E reset/fill/display-change block at the end (120 PASS). Wave-3 verifier (haiku) + reviewer (sonnet) launched.
- Review 3.1: no blockers; minors to send back after verifier: reset order (docks before show; final layout+save after all windows shown, incl. first-created), fillGaps must treat shaded bars as obstacles, E2E display patch try/finally + fake area relative to the real one.
- Wave 3 verify: OUTSIDE-OWN none; typecheck, lint, test 191, build, E2E ALL PASS (119). Review minors sent back to 3.1 builder (reset order/save after show, fill gaps shaded obstacles, display patch try/finally + relative fake area). Wave 4 waits for it.
- 3.1 follow-up done: async resetWindows (docks first, wait for shown, layout+save once), fillGaps shaded obstacles, E2E try/finally + 65% fake area; 123 PASS. TDD gap: follow-up E2E checks not run red against old code (no unit seam) — report to user.
- W4 launched: 4.1 sonnet (resize-end snapping), 4.2 haiku (docs).
- 4.2 haiku done: WINDOWS (rule 8, side 1/9/10, docking 3/3a/3b, checklist), ARCHITECTURE, DECISIONS +4. resetWindows name confirmed in code by orchestrator.
- 4.1 sonnet done: snapResize in keepProportion (programmatic+resizeTarget, proportion fix skipped), E2E snap-resize block (3 checks red→green; album check reshaped after the red run), full E2E ALL PASS. Final verifier (full suite incl. cargo) + reviewer 4.1 launched.
- Review 4.1: no blockers; minors accepted (E2E (b) lacks a changed-height assertion, (c) depends on menu toggles; recovered by tail Reset).
- FINAL verify: OUTSIDE-OWN none; typecheck, lint, test 191, cargo test, clippy, build pass; no oncePerClick/308..924 left; dock E2E ALL PASS (125).
- Complete. Mix: 3 opus (1.1, 1.3, 2.1) · 3 sonnet (1.2, 3.1, 4.1) · 1 haiku (4.2); plus sonnet research, sonnet reviewers, haiku verifiers. Follow-ups sent back: 1.3 (integer sizes, overlap), 1.1 (flake: not reproduced, diagnostics added), 3.1 (reset order, shaded obstacles, E2E restore). VERIFY fix 1.3: E2E drop offset 90→110 (3 lines). TDD gap: 3.1 follow-up checks not run red first. No escalations. Nothing committed or pushed; Windows/macOS CI not run.
