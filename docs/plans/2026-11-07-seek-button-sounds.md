# Plan: Seek button sounds (click vs hold)
Status: Complete

## Goal / Done when / Non-goals
Goal: forward/backward buttons sound like a real deck. Short click: the forward/backward key sound. Long press: the same key sound plus the tape-motor loop, playing in parallel.
Done when: a click plays `seek` (rewind_forward.mp3) at press; a hold plays `seek` at press and the `motor` loop from the hold start until release; a node:test proves both; pnpm typecheck/lint/test pass.
Non-goals: engine changes (the mixer already plays clips in parallel), new audio assets, keyboard behaviour changes beyond keeping it consistent.

## Open questions
- [x] When does the key sound fire? User: at press (0 ms), for clicks and holds alike; motor joins at hold start (400 ms) until release.

Contract: `createHoldMotor(startLoop, stopLoop, key)` in seekHold.ts gains `press()` (plays key once per press). useSeekHold calls `a.motor.press()` right after creating Active (pointer and key), and `seekOnce` no longer calls `playSound('seek')`.

## Contracts
MAP: none
Facts (orchestrator, from source): `useSeekHold.ts:59` plays `seek` only in `seekOnce` (hold start / key press); click path (`release`) plays nothing. Motor loop via `createHoldMotor` (`seekHold.ts`). Engine `Mixer` has MAX_VOICES slots, so clips already mix in parallel.

## Waves
| # | Task | Tier | Scores A/B/R | Files owned | Acceptance |
|---|------|------|--------------|-------------|------------|
| 1.1 | Key sound on press, motor on hold | haiku | 0/1/1 | app/src/renderer/src/input/seekHold.ts, useSeekHold.ts, app/test/seekHold.test.ts | failing test first; click → `seek` once, no motor; hold → `seek` once + motor start/stop; pnpm typecheck/lint/test pass |

## Log
- 2026-11-07 grill started; current-behaviour facts gathered from source.
- Baseline porcelain: `?? assets/ui/all basic cassette/`, `?? assets/ui/source/album cover deck/`, `?? docs/plans/2026-11-07-seek-button-sounds.md`
- Approved ("go"). Launched 1.1 haiku (fast-lane prompt).
- 1.1 done (haiku, no retry): red 2 fail -> green 57/57. Verifier (haiku): outside-own none; typecheck/lint/test pass; useSeekHold diff confirmed.
- Actual mix: 1 haiku builder + 1 haiku verifier, 0 escalations. Not checked in the running app.
