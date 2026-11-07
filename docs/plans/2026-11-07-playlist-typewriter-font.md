# Plan: Playlist typewriter font
Status: Complete

## Goal / Done when / Non-goals
Goal: playlist album heading and song rows use "Another Typewriter" (`atwriter.ttf`, public domain) at a fixed size, styled separately from the rest of the app.
Done when:
- `PLAYLIST.FONT_FAMILY` = 'Another Typewriter'; HEADING.fontSize 32, ROW.fontSize 28, ROW.pitch 36.
- Heading and row artist/title joined with ' – ' (en dash, the font has no '-'); font stack `'Another Typewriter', monospace`.
- Old Sue Ellen Francisco font + OFL.txt removed; new font + its EULA bundled under `assets/ui/playlist/fonts/`.
- New node:test passes; typecheck, lint, test, cargo test, clippy pass; docs updated.
Non-goals: reading OS text size (decided: fixed size; OS-aware sizing would break locked decisions #5/#6), a text-size setting, changing "Track list"/footer (painted in art), other views' fonts.

## Open questions
- [x] Size → Option 3: heading 32 / rows 28 / pitch 36 (chosen from HTML preview).
- [x] OS font size → no; fixed size. Rust core can't own UI prefs (#5), would break identical-UI (#6).
- [x] Missing glyphs (-, …, accents) → en dash join + `monospace` fallback.

## Contracts
- Font file: `assets/ui/playlist/fonts/AnotherTypewriter.ttf`, EULA `assets/ui/playlist/fonts/AnotherTypewriter-EULA.txt`.
- Separator string: `' – '` (U+2013) everywhere PlaylistView joins artist/title.
- Ownership: 1.1 owns code/assets/test; 1.2 owns docs.

## Waves
| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Swap font, sizes, separator, fallback (TDD) | haiku | app/src/shared/layout.ts, app/src/renderer/src/views/PlaylistView.tsx, assets/ui/playlist/fonts/*, app/test/playlistFont.test.ts | — | test red then green; old font gone; pnpm test/typecheck/lint pass |
| 1.2 | Docs: DECISIONS (append), MANIFEST, ASSETS_TODO | haiku | docs/DECISIONS.md, assets/ui/MANIFEST.md, docs/ASSETS_TODO.md | — | no stale Sue Ellen refs outside docs/plans |

## Log
- MAP: none (codebase map list given in session context only)
- Approved 2026-11-07 ("go ahead").
- Baseline porcelain: `?? "assets/ui/all basic cassette/"`, `?? "assets/ui/source/album cover deck/"`, `?? docs/plans/2026-11-07-playlist-typewriter-font.md`
- Launched 1.1 (haiku) and 1.2 (haiku) in parallel.
- 1.2 done (haiku): DECISIONS appended, MANIFEST + ASSETS_TODO updated; MANIFEST.md:69 keeps one pointer naming the replaced font (acceptable).
- 1.1 done (haiku): red→green, 63 pass; typecheck+lint clean; deletions staged via git rm.
- Verifier (sonnet): outside-own none; typecheck, lint, test 63/63, cargo test, clippy, build all pass; font bundled in app/out. Runtime CDP check skipped: a running `pnpm dev` instance holds Electron's single-instance lock.
- Complete. Mix: 2 haiku builders + 1 sonnet verifier, 0 escalations, 0 VERIFY fixes.
