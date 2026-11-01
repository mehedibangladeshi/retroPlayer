# Plan: Investigate and shrink the app build size
Status: Complete
## Goal / Done when / Non-goals
Goal: find out why each release bundle is ~118-156 MB and shrink it.
Done when: React not in app.asar; sidecar built with lto/codegen-units=1/strip; compression maximum; local Linux package measured smaller and the packaged app still runs.
Non-goals: locale pruning (user declined), deleting Chromium files (swiftshader, licences), panic=abort, fewer bundle formats, switching off Electron.
## Open questions
- [x] Where do the bytes go -> S1
- [x] Reductions -> user: drop React from bundle, optimise sidecar, maximum compression (not locales)
## Contracts
MAP: none
Baseline `git status --porcelain`: clean (7f395ef)
## Waves
| # | Task | Tier | Own |
|---|---|---|---|
| 1 | React to devDependencies + lockfile (offline), compression: maximum, DECISIONS entry | haiku | app/package.json, pnpm-lock.yaml, app/electron-builder.yml, docs/DECISIONS.md |
| 2 | [profile.release] lto=fat, codegen-units=1, strip=symbols (opt-level 3, panic unwind) | haiku | engine/Cargo.toml |
## Log
- S1 size analysis (sonnet analyst, ponytail-audit lean lens + superpowers systematic-debugging root-cause method) — launched
- S1 done: linux-unpacked 300 MB, Electron ~283 MB (94%, binary 234 MB); ours 13.6 MB of which ~8.3 MB is react/react-dom/scheduler copied into app.asar (already bundled by Vite) and sidecar 4.3 MB unstripped, no [profile.release]. Spot-checked: no profile in Cargo.toml (confirmed), asar 9.2 MB (confirmed). panic=abort REJECTED: sidecar relies on catch_unwind (main.rs:190).
- Approved ("ok"). Baseline porcelain: ?? docs/plans/2026-11-01-shrink-build-size.md. Tasks 1, 2 haiku launched
- 1 done: react->devDeps, lockfile refreshed offline (frozen offline install passes), compression maximum, DECISIONS entry; typecheck+build pass
- 2 done: [profile.release] lto fat, cgu 1, strip; sidecar 4,282,720 -> 2,872,160 B (-33%), stripped; release sidecar tests + clippy pass. Final verifier (sonnet) launched
- Final verify: all checks pass; pnpm package 4m39s. asar 9.23 MB -> 0.88 MB (no node_modules), sidecar 4.28 -> 2.87 MB, unpacked ~300 -> 290.5 MB, AppImage 128.6 -> 101.8 MB, tar.gz 122.9 -> 121.3 MB. Packaged smoke run: renders, 3 sounds loaded, plays WAV.
- Complete. Mix: 1 sonnet analyst, 2 haiku builders, 1 sonnet verifier; 0 retries, 0 escalations, 0 VERIFY fixes.
