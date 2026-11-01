# Plan: Ponytail audit and fixes
Status: Complete
## Goal / Done when / Non-goals
Goal: audit the whole repo with ponytail-audit, then fix the findings the user picks.
Done when: all 14 picked findings (E1-E6, C1-C6, lean L1-L4) are fixed; cargo test, clippy, pnpm typecheck, pnpm lint and the new ndjson node:test pass; docs updated.
Non-goals: device-dependent behaviour changes beyond the findings; cargo fmt cleanup; new JS dependencies; running CI (needs a push).
## Open questions
- [x] Which audit findings to fix -> "Everything" (user, 2026-11-01)
- [x] L2 decision: delete Transport::seek/seek_relative + their tests (Player clamps itself via clamp_seek; clamp_seek and set_position tests stay)
- [x] L1 decision: remove Output's duplicate set_playing/clear/clear_pending/frames_played/reset_frames (keep open_default, play_clip, handle, has_failed); move their doc comments onto OutputHandle
- [x] C6 decision: Node's built-in node:test with native TS type stripping, no new dependency; resolve the @shared alias with a small loader hook if needed
## Contracts
MAP: none
Baseline `git status --porcelain`: clean (6ba6ac3)
## Waves
| # | Task | Tier | Own |
|---|---|---|---|
| 1.1 | E1 E3 E4 E5 E6 | sonnet | engine/crates/player-core/src/player.rs, sound.rs, tests/player.rs, docs/ARCHITECTURE.md |
| 1.2 | E2 | haiku | engine/crates/engine-sidecar/src/main.rs |
| 1.3 | L1 L2 | haiku | engine/crates/player-core/src/output.rs, state.rs |
| 2.1 | C4 C5 C6 | sonnet | app/src/main/ndjson.ts, settings.ts, index.ts, new app/test/**, app/package.json, package.json, CLAUDE.md, docs/DECISIONS.md |
| 2.2 | C1 C2 C3 | haiku | .github/workflows/package.yml |
| 2.3 | L3 L4 | sonnet | app/src/renderer/src/** |
## Log
- A1 audit engine/ (sonnet analyst) — done: 0 high, 1 medium (clip freed in callback on loadSound replace), 7 low; cargo test+clippy pass
- A2 audit app/ + CI/packaging (sonnet analyst) — done: 0 high, 1 medium (CI no checks before bundle), 7 low; typecheck+lint pass
- Approved by user ("go"). Baseline porcelain: ?? docs/plans/2026-11-01-ponytail-audit-fixes.md
- 1.1 sonnet launched · 1.2 haiku launched · 1.3 haiku launched
- Wave 2 contract: root package.json `"test": "pnpm --filter app test"`; app package.json `"test"` runs node:test on app/test/; CI check job runs `pnpm test`.
- 1.2 done: sounds map in main.rs, replay on panic reset inside catch_unwind; sidecar tests+clippy pass (stray read-only Claude Docs guide call, no effect)
- 2.3 sonnet launched early (no deps, slot freed by 1.2)
- 1.3 done: Output dupes removed (docs moved to OutputHandle), Transport seek helpers + 4 tests removed, 1 set_position test added; lib tests 38 pass, clippy clean
- 1.1 done: retired Vec<Clip>, convert on open/load, E3 restore set_playing on rewind fail, E6 reopen only when Empty (deviation: not Stopped), 3 tests; all tests incl. --ignored pass, clippy clean
- 2.3 done: position quantised to 1 s (setState bails), Ctrl+O via useKeyboard onOpen; typecheck+lint pass. Orchestrator reviewed 1.1 diff line by line: OK (old stream dropped before retired.clear and re-convert)
- 2.2 done: permissions read/write split, check job (typecheck, lint, test, cargo test, clippy, tag version guard), bundle needs check; yaml parse + version-guard simulation pass
- Verifier wave 1 + 2.3: OUTSIDE-OWN none; workspace tests, --ignored device tests (5), sidecar tests, clippy, typecheck, lint pass
- 2.1 done: isValidCommand ext + SOUNDS checks, window clamp in index.ts initialBounds, node:test 9/9 with alias hook, scripts, CLAUDE.md, DECISIONS.md
- Orchestrator reviewed 2.1 (IPC trust boundary) diff line by line: OK. Final verifier (sonnet: suite + CDP e2e) launched
- Final verify: cargo test, --ignored (5/5), clippy, typecheck, lint, pnpm test (9/9) pass; e2e.mjs 13/13; e2e-audit.mjs 6/6; no leftover processes.
- Complete. Actual mix: 3 haiku builders · 3 sonnet builders, 0 retries, 0 escalations, 0 VERIFY fixes. Deviations: E6 reopens a failed output only when Empty (not Stopped); E3 restores playing instead of moving to Stopped; C4 clamp lives in index.ts, settings.ts unchanged.
