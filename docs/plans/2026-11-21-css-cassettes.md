# Plan: Cassette designs in HTML/CSS
Status: Not started

## Goal
Redraw all nine cassettes as HTML/CSS layers instead of PNGs: the original cassette and the eight colour sets in `assets/ui/all basic cassette/` (black, blue, cream, grey, pastel-green, red, white, yellow). CSS layers scale crisply at any window size and can be recoloured in code, which the per-album design needs.

## Done when
- Each design renders side by side with its PNG and matches it: same proportions, the CASSETTE rect `{x:90, y:85, w:586, h:342}` in `app/src/shared/layout.ts`, and the same reel centres.
- The reels still animate for every state (rotate while Playing, ease to a stop on Pause and Stop, faster while a seek is held).
- The owner approves each design by name before its PNG is retired.
- `docs/ASSETS_TODO.md` and `assets/ui/MANIFEST.md` list what changed.

## Constraints
- `AGENTS.md` says not to invent or redraw final artwork. Each design needs the owner's explicit approval before it replaces its PNG.
- Side-by-side visual checks against the PNG, run in the built app over the Chrome DevTools Protocol.

## Open questions
- Should the CSS version replace the PNGs, or sit beside them until approved?
- Which parts stay PNG (textures, soft shadows), and which become CSS?
- Which colours are per design and which are fixed across all nine?
- Redraw all nine at once, or one design first as a pilot?
- How close must the match be: pixel level, or the same look at normal size?
