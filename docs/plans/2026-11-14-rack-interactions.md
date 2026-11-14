# Plan: Rack interactions (tickets .scratch/rack-tickets/01-06)
Status: Complete

## Goal / Done when / Non-goals
Goal: solve the six rack tickets in `.scratch/rack-tickets/`. They cover: double-click plays; a single click slides out a tracklist preview; hover pulls the spine out; the drag ghost is 1.05× the spine; a drag never opens the preview; a "+" spine imports an album. Follow TDD, and use Opus sub-agents where needed.

## Open questions
- [x] Preview of a missing folder: remove the spine silently, open no preview.
- [x] Double-click a preview row: no. The preview is read-only for now. Record "row double-click plays the track" in DECISIONS.md as a future idea.
- [x] Keyboard on a focused spine: Enter plays, Space toggles the preview.
- [x] Single click = preview only. Double click = play directly, and no preview ever shows. Any other rack interaction closes the preview. That covers a click outside it, the wheel on the shelf, a right-click, a drag start, Escape and window blur. Interaction inside the preview (scrolling its list) keeps it open.
  - So a single click waits PREVIEW_DELAY_MS (300) before it opens the preview, and a second click inside that time cancels it and plays. shortcut: fixed 300 ms, not the OS double-click time.
- [x] Slide direction: sideways to the right of the spine, over its neighbours, at full spine height. It flips left near the right edge.
- [x] A preview scan must not bump the album in Recent: the albumInfo that answers a preview is not recorded.

## Contracts
MAP: none

Rough split (scores A/B/R):
- T-ghost (04): pure `dragGhostBox` + setDragImage in RackView (1/1/1 → sonnet)
- T-rows: extract the playlist's track rows into a shared `TrackRows` component (1/1/1 → sonnet)
- T-ipc: `rack:tracks` IPC + a pure request/answer matcher in main (1/2/1 → sonnet, opus per user)
- T-click (01+05+03+06): pure `spineClick`, double-click plays, drag guard, hover CSS, "+" spine (1/1/1 → sonnet)
- T-preview (02): slide-out panel in RackView using TrackRows + rackTracks (2/1/1 → opus)

## Contracts (fixed)
- `RetroApi.rackTracks(dir: string): Promise<Album | null>`, IPC `rack:tracks` (invoke/handle). Main validates with `dirArg`, accepts only a dir that is in the rack, and handles a missing dir with `remove` → null. Otherwise it sends `scanAlbum` and resolves on `albumInfo` for that path, or null after 5 s.
- `app/src/main/rackTracks.ts` (pure): `scanWaiter(send: (path) => void, timeoutMs)` → `{ request(path): Promise<Album|null>; answer(path, album): boolean }`. `answer` returns true when it settled a pending request, and then index.ts does NOT `record` it.
- `app/src/renderer/src/views/TrackRows.tsx`: `TrackRows({ album, currentPath?, selected?, pitch, rowFont, padLeft, onRowClick? })`. It renders the existing `.pl-row` markup, and the row name comes from a pure `trackRowName(track, i, albumArtist)`.
- `app/src/renderer/src/views/rackClick.ts` (pure): `PREVIEW_DELAY_MS = 300`. `spineClick(detail, dragged)` → `'preview' | 'play' | null`. `spineKey(key)` → `'play' | 'preview' | null`.
- `app/src/renderer/src/views/rackDrag.ts` (pure): `dragGhostBox(rect, clientX, clientY, k = 1.05)` → `{ w, h, ox, oy }`.
- RackView state: `previewDir: string | null` (set by 2.1, panel rendered by 3.1).

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Drag ghost 1.05× (04) | sonnet | views/rackDrag.ts, test/rackDrag.test.ts, RackView.tsx | — | test red→green; setDragImage clone 1.05× on-screen rect, removed on dragend |
| 1.2 | Extract TrackRows from playlist | sonnet | views/TrackRows.tsx, PlaylistView.tsx/.css, test/trackRows.test.ts | — | trackRowName test; playlist unchanged; all tests green |
| 1.3 | rack:tracks IPC + scanWaiter | opus | main/rackTracks.ts, test/rackTracks.test.ts, main/index.ts, shared/api.ts, preload/index.ts | — | waiter tests (match, timeout, no bump); dir not in rack rejected |
| 2.1 | Click rules, keyboard, drag guard, hover lift, "+" spine (01, 03, 05, 06) | sonnet | views/rackClick.ts, test/rackClick.test.ts, RackView.tsx/.css | 1.1 | spineClick/spineKey tests; dblclick plays; + adds via folder dialog without play |
| 3.1 | Slide-out preview panel (02) | opus | RackView.tsx/.css, views/rackPreview.ts, test/rackPreview.test.ts | 1.2, 1.3, 2.1 | placement test; panel shows tracks; closes on any other interaction |
| 3.2 | Docs | haiku | docs/DECISIONS.md, CONTEXT.md, docs/TESTING.md, docs/ROADMAP.md | 2.1 | decisions + future row-dblclick note; Preview term; checklist |
| 4.1 | Live CDP check | sonnet | scratchpad only | 3.1 | built app: preview, dblclick, hover, ghost cleanup, + spine, no bump |

## Log
- 2026-11-14 Grilling started. MAP: none.
- Approved ("go ahead"). Baseline porcelain: ?? .scratch/ · ?? assets/ui/all basic cassette/ · ?? assets/ui/source/album cover deck/ · ?? assets/ui/updated send 9-11-26/ · ?? docs/plans/2026-11-14-rack-interactions.md
- Wave 1 launched: 1.1 sonnet, 1.2 sonnet, 1.3 opus.
- 1.1 sonnet done: dragGhostBox + 4 tests; ghost = an off-screen bare .rk clone, removed on setTimeout(0). Diff reviewed by the orchestrator, OK.
- 1.2 sonnet done: trackRowName/formatDuration + TrackRows; the row CSS selectors went from `.pl .pl-row` to `.pl-row`. Note: the rack must import PlaylistView.css or carry its own row rules.
- 1.3 opus done: scanWaiter + rack:tracks. Deviation (accepted): a null answer removes the spine; a timeout keeps it.
- VERIFY fix 1.3 (2 lines): strip the cover from the rackTracks reply.
- 2.1 sonnet launched (after 1.1 was verified). Wave-1 verifier (haiku) and reviewer (sonnet) launched.
- Wave 1 verified: typecheck and build pass; the only test and lint failures were in 2.1's files mid-edit. Reviewer: no blockers. Accepted minors: an albumInfo arriving after the timeout is recorded (it bumps Recent; rare); the inert rows are still focusable buttons.
- 2.1 sonnet done: rackClick + 4 tests, click/keyboard/drag guard/close triggers/hover/"+". Note: a stale previewDir is cleared by deriving it, not by an effect (lint rule).
- VERIFY fix 2.1 (2 lines, test first): a triple-click returns null so it does not restart the album.
- Wave 3 launched: 3.1 opus (preview panel), 3.2 haiku (docs), 2.1 reviewer (sonnet).
- 3.2 haiku done: DECISIONS entry (with the deferred row double-click), the CONTEXT Preview term, the TESTING checklist, the ROADMAP line. Spot-checked, OK.
- 2.1 review: blocker — the hover scale overflows the 24 px shelf padding in tall windows. Minors: dragRef can stick if the source unmounts; "+" double-click opens two dialogs. All three were sent to the live 3.1 agent (it owns RackView now).
- 3.1 opus done: previewPlacement + tests, the .rk-preview panel (plain light paper, Montserrat), TrackRows.css split out of PlaylistView.css, the appFont exception extended test-first, and the 3 addendum fixes. Known limit: closing mid-slide-out jumps to fully open, then slides back.
- Final: verifier (haiku), 3.1 reviewer (sonnet) and 4.1 live CDP check (sonnet) launched.
- Final verifier: 244 JS tests, typecheck, lint, build, cargo test and clippy all pass; OUTSIDE-OWN none.
- 4.1 live CDP: a–h PASS (preview after 300 ms with the right rows, no Recent bump, no play; Escape closes; dblclick plays with no preview; hover -6.6 px inside the shelf; "+" last; no ghost left; playlist rows in Montserrat). i FAIL was a test artifact (a synthetic dragstart without dragend left dragRef set); the b screenshot shows the panel. Not checked: an empty-shelf click closing it.
- 3.1 review: no blockers. VERIFY fix 3.1 (1 line): a rejected rackTracks call is treated as null, so the panel can't stick on Loading. Re-ran typecheck, lint and test: 244 pass.
- Accepted minors / follow-ups: closing mid-slide-in jumps before sliding out; the inert preview rows still show a hover highlight and take focus; the 300 ms delay ignores the OS double-click time; a late albumInfo after the 5 s timeout bumps Recent.
- Close: tier mix 1 haiku · 4 sonnet · 2 opus builders (+ 2 haiku verifiers, 3 sonnet reviewers); no escalations; 3 VERIFY fixes (1.3, 2.1, 3.1).
