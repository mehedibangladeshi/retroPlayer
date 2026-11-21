# Plan: fix dock E2E failures on CI runners
Status: Complete

## Goal / Done when / Non-goals
Goal: find why the `dock-e2e` workflow fails on GitHub runners and plan the fix.

## Open questions
- [x] Q1 Min heights (design conflict): every window's minimum height = the player's minimum height, which is a flat 200 (windowSize.ts:54-56; the 206 in CI logs was the default size). Playlist 218 -> 200 (its min composition shrinks, ~2 rows instead of 3), rack 178 -> 200, album/power/player already 200. Min widths unchanged. Update WINDOWS.md rule 8 + DECISIONS.md (append).
- [x] Q2 Linux WM rounding (F1): loosen the E2E on Linux: <= 4 px height tolerance, size the album in the test with the fixed-bar formula (widthForHeight), compare snaps against the edges actually read. No app change.
- [x] Q3 Verify: CI workflow_dispatch of dock-e2e on a throwaway branch `debug/e2e-fix` (confirm before pushing; delete branch after).
- [x] Q4 F2 app bug: `resetWindows` (app/src/main/index.ts:948) must pass `s.freeMin` to displayLimits (test-first per AGENTS.md 8). Orchestrator decision.
- [x] Q5 F3 Windows overlap: test-expectation; cap the side-resize H in dock.mjs:140 so the docked group's width fits work.width. Orchestrator decision.

## Contracts
- `MIN_H = 200` stays the single floor (windowSize.ts). `displayLimits` for a free window: `minHeight = MIN_H` (was `freeMin.height`); `minWidth = freeMin.width` unchanged. Aspect windows unchanged.
- `FREE_MIN_COMP.playlist.h` lowered so `freeMinWindow(playlist).height <= 200` (ceil(h*0.55) <= 200 -> h <= 363); rack composition unchanged (its window min height becomes 200 from the floor). The renderer must not clip at 200 tall (chromeFit uses FREE_MIN_COMP as the min composition).
- `resetWindows` (index.ts:948) passes `s.freeMin` like every other displayLimits call site.
- E2E (`scripts/e2e/dock.mjs`): `const TOL = process.platform === 'linux' ? 4 : 2` for side-vs-player height checks; album sized via the shared fixed-bar formula (chrome.ts widthForHeight or equivalent), heights compared with `near()`; snap expectations use the edges read back from the windows; side-resize H capped so the docked group's total width (sum of widths + gaps) fits `work.width`; min expectations use 200 for every window.

## Waves
| # | Task | Tier | Own | Depends | Acceptance |
|---|---|---|---|---|---|
| 1.1 | Min heights 200 + resetWindows freeMin, test-first | sonnet | app/src/main/windowSize.ts, app/src/shared/freeMin.ts, app/src/main/index.ts, app/test/windowSize.test.ts, app/test/chromeFit.test.ts (+ a new app/test file if a helper is extracted) | — | red then green; playlist/rack min h 200 in unit tests; reset uses freeMin; pnpm test/lint/typecheck pass |
| 1.2 | E2E dock.mjs fixes | sonnet | scripts/e2e/dock.mjs | contract | Linux TOL 4, album fixed-bar sizing, read-back snap edges, H cap fits work.width, 200 mins; `node --check` passes |
| 1.3 | Docs | haiku | docs/WINDOWS.md, docs/DECISIONS.md | contract | rule 8 says every window min height 200 (playlist/rack widths still from freeMin); one appended DECISIONS entry (2026-11-21) with Decision/Why |
| 2.1 | CI dispatch on debug/e2e-fix (orchestrator, after user confirm) + read results | — | — | 1.x verified | dock-e2e green on ubuntu, windows, macos |
| 2.2 | Fix CI findings (if any), retry ladder | sonnet | owner of failing file | 2.1 | rerun green |

## Log
- MAP: graphify — `graphify query "<q>"`, `graphify explain "<X>"` from the repo root (graphify-out/ rebuilt by git hooks after the last merge; fresh).
- Latest run 44789300704 (dev, b3a053c, 0.3.2 release merge): e2e ubuntu, macos, windows all failure. Last 30 runs: 14 failure / 16 success. Previous success 43626092463 (2026-11-14, 0.3.1 merge).
- Scout (sonnet): F1 Linux side heights 1-4 px off player (startup 389 vs 386/388; album 334 for H=330), cascades 13 checks. F2 mac/Win 1024-wide: playlist min 218 > player min 206, default layout can't align bottoms (reset, snap, tile checks). F3 Windows: album overlaps player after side resize (album x=2 w=317, player x=299). Only test change since green: ad33ad6. Older 11-14 failures = 1 px flaky, different. Logs in scratchpad/e2e-logs/.
- No local Xvfb/openbox; repro needs CI dispatch, desktop run, or installing xvfb.
- Launched analyst (sonnet): verdict per failure (app bug / test / design conflict) vs docs/WINDOWS.md.
- Min-size scout (haiku): player min h flat 200 (windowSize.ts:54-56); free windows use freeMin height instead of the floor (windowSize.ts:64); FREE_MIN_COMP {playlist 400x395, rack 600x323} (freeMin.ts:5) -> 220x218 / 330x178 at CHROME_SCALE; resetWindows index.ts:948 omits freeMin (only call site). Unit tests windowSize.test.ts:84-95 assert the free mins.
- Lock confirmed by user ("ok").
- Preview approved ("ok"). Baseline `git status --porcelain`: `?? docs/plans/2026-11-21-dock-e2e-failures.md` (+ pre-existing untracked assets/ folders), HEAD b3a053c.
- Launched 1.1 sonnet (min heights + reset freeMin), 1.2 sonnet (dock.mjs), 1.3 haiku (docs).
- 1.3 done (haiku): WINDOWS.md rule 8 + DECISIONS.md 2026-11-21 entry.
- 1.2 done (sonnet): TOL, widthForHeight album sizing, HW width cap (album+player+playlist; power?), near(TOL), read-back snap targets; mins come from app's displayLimits.
- 1.1 done (sonnet): limitsFor helper (reset/satellite/createSatellite), free minHeight 200, playlist comp h 363; 344 pass. Deviation: no red phase run -> verifier red-checks in a scratch worktree. Playlist at 200 tall fits ~4 rows (not 2); rack composition grows to 363.6.
- VERIFY fix 1.3 (1 line): DECISIONS.md "about 2 rows instead of 3" -> "still fits about 4 rows".
- Launched verifier (haiku, with red check) + reviewer (sonnet, 1.1+1.2; power in width cap, stale FREE_MIN_COMP copy in dock.mjs ~l.100).
- Verifier: OUTSIDE-OWN none; 344 pass; lint/typecheck clean; node --check ok. Red check: new windowSize.test.ts fails to load on HEAD (no limitsFor export) -> accepted as red (import-level).
- Reviewer: 1.1 no blockers (minor: freeMin.ts row comment). 1.2 blockers: dock.mjs:173 rack min height vs 178; HW omits power deck. Minor: stale comment :836.
- Launched 1.2 retry (sonnet) with the two blockers + comment.
- 1.2 retry done (sonnet): HW includes power deck + 3rd gap; rack limits check uses MIN_H; comment fixed. Expected limits come from app's displayLimits import (dock.mjs:11,113).
- User confirmed push. debug/e2e-fix 9a54bcb (pre-commit passed) pushed; dock-e2e dispatched: run 44868620200.
- CI run 44868620200 (debug 9a54bcb): still failing but down: linux 13->5, windows 5->3, macos 5->4. Remaining: power resize (all), power proportion (win/mac, album off-screen), aspect album snap (all), free playlist snap (linux), side resize playlist/album-above (linux), restart album on top of playlist (mac).
- Launched 2.2 sonnet: diagnose each (test vs setup vs app bug), fix test-side in dock.mjs, report app bugs.
- 2.2 done (sonnet): 5/6 fixed test-side (pwFor fixed-bar power sizing, proportion drag clamped to on-screen slack, snap drags 5 px short, side-resize dh avoids snap zone, TOL on album height and restart offsets). (c) app bug: snapResize byWidth (dock.ts:195) treats bar-window bottom drags as width drags -> no snap.
- Scope change approved by user ("ok, fix the app"): 2.3 sonnet snapResize body-height fix, test-first with red shown; 2.4 commit+push debug branch, rerun dock-e2e.
- 2.3 done (sonnet): snapResize extraH param, byWidth on body height; red shown (399 vs 400), green 345.
- VERIFY fix 2.3 (1 line): index.ts:430 passes `s?.extraH ?? 0` to snapResize. typecheck clean, 345 pass.
- 2.4: debug/e2e-fix 778e179 (pre-commit passed) pushed; dock-e2e run 44869290487 dispatched.
- CI run 44869290487 (778e179): not green: windows 1 (power proportion), macos 2 (power resize, power proportion), linux 4 (power resize, power proportion, reset saved bounds, album snap 5 px). Bar-window snap fix effective on win/mac. Not committed to dev (user condition: green only).
- Launched 2.2 retry (sonnet, ladder step 2): power resize/proportion, linux reset + album snap; app bugs to be reported not patched.
- 2.2 retry done (sonnet): pwFor double-counted the power bar (test bug) -> fixed; TOL on reset and album snap. Suspected app bug (unconfirmed): keepProportion (index.ts ~419-436) doesn't relock aspect at the corrected height on X11.
- Round 3 pushed to debug/e2e-fix (pre-commit passed); dock-e2e run 44869808100.
- CI run 44869808100 (round 3): windows SUCCESS, macos SUCCESS, linux 2 FAILED (power resize 155x336 for 330; power proportion 220x468 = stale 336 lock ratio).
- Scope change approved by user ("ok, fix the app"): 2.5 sonnet keepProportion relock at corrected height (test-first, red shown); 2.6 push + rerun, then commit to dev and delete debug branch if green.
- 2.5 done (sonnet): resizeEnd.ts lockHeightAfterResize + 3 tests (red: module missing), keepProportion relocks after both corrections; 348 pass. Checked lockAspect: free windows -> setAspectRatio(0), harmless.
- Round 4 pushed (pre-commit passed); dock-e2e run 44870358841.
- CI run 44870358841 (round 4): windows SUCCESS, macos SUCCESS, linux 2 FAILED with identical numbers (power 155x336 for 330; 220x468). Relock had no effect on these checks -> diagnosis wrong or path not reached (test sizes power programmatically; openbox aspect hint). Ladder exhausted -> Paused. Not committed to dev (user condition: green). Debug branch kept.
- User chose option C: loosen only the two Linux power checks (POWER_TOL 8 on linux) and record a known bug in WINDOWS.md "Known bugs". Then CI; if green commit to dev and delete debug branch. Launched 2.7 haiku.
- 2.7 done (haiku): POWER_TOL (linux 8) on the two power checks; WINDOWS.md "Known bugs" entry. Round 5 run 44874055611: linux SUCCESS, windows SUCCESS, macos 2 FAILED (startup: side windows still at 206 next to a 277 player — layout not settled; macos passed rounds 3+4 with the same macOS-relevant code). Rerunning the failed job once (flake check).
- Rerun of macOS job: SUCCESS -> run 44874055611 green on ubuntu, windows, macos. dev files identical to debug/e2e-fix (checked per file).
- Complete. Mix: builders 2 haiku (1.3, 2.7) + 5 sonnet (1.1, 1.2, 1.2 retry, 2.2, 2.2 retry, 2.3, 2.5); scouts/analysts 1 haiku + 2 sonnet; verifier 1 haiku, reviewer 1 sonnet. VERIFY fixes: 1.3 (DECISIONS row count), 2.3 (index.ts snapResize extraH arg). Escalations: 2.2 ladder exhausted on Linux power drift -> user chose known-bug tolerance (WINDOWS.md Known bugs).
