# Cassette rack: interaction tickets

Follow-ups to the rack feature (commit 07d4b18, plan `docs/plans/2026-11-14-rack-album-history.md`).
TDD applies to every ticket (AGENTS.md item 8): pure logic gets a `node:test` test in `app/test/` first;
behaviour only visible in the app gets a CDP check described in the report.

| # | Ticket | Type | Depends on |
|---|--------|------|-----------|
| 01 | [Double-click a spine to load and play](01-double-click-plays.md) | feat | – |
| 02 | [Single click slides out a tracklist preview](02-single-click-tracklist-preview.md) | feat | 01, 05 |
| 03 | [Hover pulls the spine out of the shelf](03-hover-pull-out.md) | feat | – |
| 04 | [Drag ghost is huge while reordering](04-drag-ghost-size.md) | bug | – |
| 05 | [A drag never opens the preview](05-drag-is-not-a-click.md) | guard | 02 |
| 06 | ["Plus" spine at the end of the rack imports an album](06-plus-spine-import.md) | feat | – |

Suggested order: 04 → 03 → 01 → 05 + 02 (one change) → 06.

Shared facts:
- Rack view: `app/src/renderer/src/views/RackView.tsx` and `RackView.css`. Spines are `<button class="rk-spine">` in `.rk-shelf`, and the whole `.rk` composition is CSS-scaled (`transform: scale(fit.scale)`).
- Today a single click calls `window.retro.rackPlay(dir)`, which loads and plays the album (main: `rack:play` handler in `app/src/main/index.ts`).
- `rack.json` stores spines only (`dir, text, image, bg, ink`). It has **no tracklist**. Tracks come from the engine (`scanAlbum` → `albumInfo {path, album}`, `Album.tracks: AlbumTrack[]`).
- The playlist's click rule already exists: `rowClickAction(detail, i)` in `app/src/renderer/src/views/rowKeys.ts` (detail ≥ 2 = play).
