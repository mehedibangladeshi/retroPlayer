# assets/ui manifest

Window content size: 767 x 616 CSS px (`app/src/shared/layout.ts`, `WINDOW`). Shipped PNGs are exactly 2x of their layout rect. Only `png/` is shipped; `source/` is the artist's original export and the regeneration input.

## png/ (shipped, 2x, RGBA, lossless, metadata stripped)

Paint order bottom to top. "Anchor" is the top-left in window CSS px.

| # | File | Pixels | Anchor (CSS) | Rect (CSS) | Content |
|---|------|--------|--------------|------------|---------|
| 1 | `png/body-base.png` | 1534x1232 | 0,0 | 767x616 | Chassis, window frame, rounded corners |
| 2 | `png/cassette-base.png` | 1172x684 | 90,85 | 586x342 | Cassette shell (opaque, full rect) |
| 3 | `png/cassette-mid.png` | 1172x684 | 90,85 | 586x342 | Cassette label, text, screws |
| 4 | `png/cassette-reel.png` | 1172x684 | 90,85 | 586x342 | Both reels (hub centres in cassette px 173.5,164 and 422.5,164.5; clip r 36, visible r≈33) |
| 5 | `png/body-top-cover.png` | 1534x1232 | 0,0 | 767x616 | Window bezel/glass, brand text "SUPER LX-RETRO", "HIGH QUALITY AUDIO", minimize/close boxes. Covers the cassette edges |
| 6 | `png/body-bottom.png` | 1534x1232 | 0,0 | 767x616 | Lower panel, bolts, PAUSE/REWIND/PLAY/FORWARD/STOP text labels |
| 7 | `png/body-buttons.png` | 1534x1232 | 0,0 | 767x616 | The five key caps with icons (no text labels) |
| 8 | `png/chrome-fullscreen.png` | 38x38 | 697,7 | 19x19 | Full-screen chrome box, derived from the minimize box art; drawn for the project, not by the artist |

### How png/ was derived

Body layers: the union alpha bbox of the four 2334x1874 source layers is the whole canvas (0,0,2334,1874), so no crop. Scale = 767/2334 = 0.32862 (same on-screen size as the reference body, x 310-1077, y 329-945 in `full-player-view.jpeg`); 2x output is 1534x1232.

Cassette layers: union alpha bbox of the three 1783x1040 layers is the whole canvas (the base is opaque), so no crop. Placement and scale were fitted by minimising the mean absolute difference against the reference crop: top-left (90,85) in window px, width 586 (= 1783 x 0.3286, same scale as the body), height 342. Output is 1172x684.

Command per file (ImageMagick 7):

    magick SRC -filter Lanczos -resize 1534x1232! -strip -define png:compression-level=9 -define png:compression-strategy=1 -define png:exclude-chunk=all PNG32:png/NAME.png    # body layers
    magick SRC -filter Lanczos -resize 1172x684!  ...same options...                                                                                       # cassette layers

Mapping: `player-body-base`->`body-base`, `player-body-top-cover-and-utility`->`body-top-cover`, `player-body-bottom-part-with-boltu`->`body-bottom`, `player-body-buttons`->`body-buttons`, `cassette/audio-red-{base,mid,reel}`->`cassette-{base,mid,reel}`.

Size: sources 7 PNGs 260,174 B; shipped 7 PNGs 269,166 B (resampled to 2x, still lossless).

Edits to the artist's art (2026-11-01): in `source/player-body-bottom-part-with-boltu.png` the right pill (alpha island at x 2013-2213, y 1461-1494) was moved 47 px right (+15.5 CSS px) so both pills have a 24 px gap to the window edge; the island was cut and pasted unchanged, the vacated area cleared to transparent, and `png/body-bottom.png` regenerated with the command above (left pill at 2x x 48, right pill ends at 2x x 1485). Then both pills (source bboxes x 73-273 and 2060-2261, y 1461-1495) were moved 60 px down so they are centred on the seam between the upper body and the lower panel (2x seam rows 1010-1012; pills now 2x y 1000-1022, CSS y 500-511), same cut, clear and paste method. Finally the seam was redrawn as a thinner shaded groove in the same source layer (it paints over body-base): on the straight run (source x 34 to 2299, feathered over 14 px so the artist's rounded panel corners stay), rows 1533-1544 are set to, top to bottom, #2F3138 #2A2B31 #1E1F24 #15161A #141519 #18191D #1E1F24 #25262C #3A3C44 #34363D #2F3138 #2F3138 (upper edge casting a shadow into a dark groove, lit lip on the lower panel); the pills were composited back on top. `png/chrome-fullscreen.png` is the minimize box crop (2x 1438,14 38x38) with its glyph filled out and four corner brackets drawn in the same glyph colour (112,115,126), about 2.6 px stroke at 2x, antialiased.

Measured values in `layout.ts` come from the shipped PNGs: reels and button keys from alpha connected components (3 px dilation, button threshold alpha > 128); text, chrome and label strip from luminance difference against the local background in the composite, and the label strip edges from the reference. `LABEL.title` is the strip (128,126,521x38) inset 4 px; `LABEL.time` is a slot left of "HIGH QUALITY AUDIO" on the same baseline.

## source/ (not shipped)

| File | Pixels | What |
|------|--------|------|
| `source/player-body-base.png` | 2334x1874 | Body layer 1 (shared body canvas) |
| `source/player-body-top-cover-and-utility.png` | 2334x1874 | Body layer top cover |
| `source/player-body-bottom-part-with-boltu.png` | 2334x1874 | Body layer bottom |
| `source/player-body-buttons.png` | 2334x1874 | Body layer buttons |
| `source/cassette/audio-red-base.png` | 1783x1040 | Cassette layer base |
| `source/cassette/audio-red-mid.png` | 1783x1040 | Cassette layer mid |
| `source/cassette/audio-red-reel.png` | 1783x1040 | Cassette layer reels (both) |
| `source/*.svg`, `source/cassette/*.svg` (9 files) | n/a | Unusable SVG exports, kept for the artist; see `docs/ASSETS_TODO.md` |
| `source/reference/full-player-view.jpeg` | 1600x1269 | Composed reference, visual reference only, never shipped |

Reference geometry: player body at x 310-1077, y 329-945 in the JPEG; window origin = (310,329).

## Playlist window

Canvas 1874x1885 px at 2x, so the design size is 937x943 CSS px. Constants are in `PLAYLIST` in `app/src/shared/layout.ts`, measured with ImageMagick (alpha bounding boxes and connected components); text positions were estimated from `reference/preview.png` aligned to the base layer (preview = art + (32,-3) px at 2x).

| File | What | Anchor (CSS px) |
|------|------|-----------------|
| `playlist/playlist-base.png` | Dark window frame and background (was "1st playlist base") | 0,0 937x943 |
| `playlist/playlist-paper.png` | Paper sheet laid over the cover, cover shows around its border (was "3rd paper like texture") | 0,0 937x943; paper bbox 70.5,91.5 781.5x790.5 |
| `playlist/playlist-top.png` | Minimize and close buttons, status dots, resize grip (was "4th top layers") | 0,0 937x943; minimize 862,20 30x30; close 895.5,20 30x30; grip 911,915 26x27 |
| `playlist/default-cover.svg` | Our own placeholder cover (gradient, blobs, grain), used when an album has no cover. Square viewBox | `COVER` 57.5,81.5 810.5x811, drawn between base and paper |
| `playlist/fonts/SueEllenFrancisco-Regular.ttf` | Handwriting font, OFL 1.1 (Kimberly Geswein) | text in `TITLE`, `HEADING`, `ROW`, `FOOTER` |
| `playlist/fonts/OFL.txt` | Licence of the font | n/a |
| `playlist/reference/cover-example.png` | Example cover from the artist, reference only, not shipped | n/a |
| `playlist/reference/preview.png` | Composed reference of the window, reference only, not shipped | n/a |

Font choice: Sue Ellen Francisco was picked over Covered By Your Grace, Reenie Beanie, Gochi Hand and Shadows Into Light Two by rendering "Track list" and "01. The Hunna - Fugazi" next to the preview. It is the only one that is as tall and condensed as the artist's lettering; it is a bit wider and rounder. Font sizes in `PLAYLIST` are estimates (cap height about 0.9 em) and need a visual check.
