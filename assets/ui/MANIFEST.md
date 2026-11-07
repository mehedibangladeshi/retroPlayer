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
| 7 | `png/body-buttons.png` | 1534x1232 | 0,0 | 767x616 | The five key caps with icons (no text labels), with baked drop shadow (extends ~5 px right, ~7 px bottom past the `BUTTONS` rects; see `BUTTON_SHADOW_PAD`) |

### How png/ was derived

Body layers: the union alpha bbox of the four 2334x1874 source layers is the whole canvas (0,0,2334,1874), so no crop. Scale = 767/2334 = 0.32862 (same on-screen size as the reference body, x 310-1077, y 329-945 in `full-player-view.jpeg`); 2x output is 1534x1232.

Cassette layers: union alpha bbox of the three 1783x1040 layers is the whole canvas (the base is opaque), so no crop. Placement and scale were fitted by minimising the mean absolute difference against the reference crop: top-left (90,85) in window px, width 586 (= 1783 x 0.3286, same scale as the body), height 342. Output is 1172x684.

Command per file (ImageMagick 7):

    magick SRC -filter Lanczos -resize 1534x1232! -strip -define png:compression-level=9 -define png:compression-strategy=1 -define png:exclude-chunk=all PNG32:png/NAME.png    # body layers
    magick SRC -filter Lanczos -resize 1172x684!  ...same options...                                                                                       # cassette layers

Mapping: `player-body-base`->`body-base`, `player-body-top-cover-and-utility`->`body-top-cover`, `player-body-bottom-part-with-boltu`->`body-bottom`, `player-body-buttons`->`body-buttons`, `cassette/audio-red-{base,mid,reel}`->`cassette-{base,mid,reel}`.

Size: sources 7 PNGs 260,174 B; shipped 7 PNGs 269,166 B (resampled to 2x, still lossless).

Edits to the artist's art (2026-11-01): in `source/player-body-bottom-part-with-boltu.png` the right pill (alpha island at x 2013-2213, y 1461-1494) was moved 47 px right (+15.5 CSS px) so both pills have a 24 px gap to the window edge; the island was cut and pasted unchanged, the vacated area cleared to transparent, and `png/body-bottom.png` regenerated with the command above (left pill at 2x x 48, right pill ends at 2x x 1485). Then both pills (source bboxes x 73-273 and 2060-2261, y 1461-1495) were moved 60 px down so they are centred on the seam between the upper body and the lower panel (2x seam rows 1010-1012; pills now 2x y 1000-1022, CSS y 500-511), same cut, clear and paste method. Finally the seam was redrawn as a thinner shaded groove in the same source layer (it paints over body-base): on the straight run (source x 34 to 2299, feathered over 14 px so the artist's rounded panel corners stay), rows 1533-1544 are set to, top to bottom, #2F3138 #2A2B31 #1E1F24 #15161A #141519 #18191D #1E1F24 #25262C #3A3C44 #34363D #2F3138 #2F3138 (upper edge casting a shadow into a dark groove, lit lip on the lower panel); the pills were composited back on top.

Measured values in `layout.ts` come from the shipped PNGs: reels and button keys from alpha connected components (3 px dilation, button threshold alpha > 128); text, chrome and label strip from luminance difference against the local background in the composite, and the label strip edges from the reference. `LABEL.title` is the strip (128,126,521x38) inset 4 px; `LABEL.time` is a slot left of "HIGH QUALITY AUDIO" on the same baseline.

## source/ (not shipped)

| File | Pixels | What |
|------|--------|------|
| `source/player-body-base.png` | 2334x1874 | Body layer 1 (shared body canvas) |
| `source/player-body-top-cover-and-utility.png` | 2334x1874 | Body layer top cover |
| `source/player-body-bottom-part-with-boltu.png` | 2334x1874 | Body layer bottom |
| `source/player-body-buttons.png` | 2334x1874 | Body layer buttons, with baked drop shadow ("player buttons with shadow") |
| `source/cassette/audio-red-base.png` | 1783x1040 | Cassette layer base |
| `source/cassette/audio-red-mid.png` | 1783x1040 | Cassette layer mid |
| `source/cassette/audio-red-reel.png` | 1783x1040 | Cassette layer reels (both) |
| `source/*.svg`, `source/cassette/*.svg` (9 files) | n/a | Unusable SVG exports, kept for the artist; see `docs/ASSETS_TODO.md` |
| `source/reference/full-player-view.jpeg` | 1600x1269 | Composed reference, visual reference only, never shipped |

Reference geometry: player body at x 310-1077, y 329-945 in the JPEG; window origin = (310,329).

## Playlist window

Canvas 1874x1874 px at 2x, so the design size is 937x937 CSS px (cropped to the base body so the window matches the player's height; positions measured on the old 1874x1885 canvas are 11 px at 2x lower). Constants are in `PLAYLIST` in `app/src/shared/layout.ts`, measured with ImageMagick (alpha bounding boxes and connected components); text positions were estimated from `reference/preview.png` aligned to the base layer (preview = art + (32,8) px at 2x on the cropped canvas). Crop each layer with `magick IN -crop 1874x1874+0+11 +repage -strip -define png:compression-level=9 PNG32:OUT` if re-exported from the old 1874x1885 canvas.

| File | What | Anchor (CSS px) |
|------|------|-----------------|
| `playlist/playlist-base.png` | Dark window frame and background, from `source/playlist-base.png` (1874x1874, new "1st playlist base"); all playlist layers are cropped to this body | 0,0 937x937 |
| `playlist/playlist-paper.png` | Paper sheet laid over the cover, cover shows around its border (was "3rd paper like texture") | 0,0 937x937; paper bbox 70.5,86 781.5x790.5 |
| `playlist/playlist-top.png` | Minimize and close buttons, status dots, resize grip (was "4th top layers") | 0,0 937x937; minimize 862,14.5 30x30; close 895.5,14.5 30x30 (the resize grip is baked in, no longer used) |
| `playlist/default-cover.svg` | Our own placeholder cover (gradient, blobs, grain), used when an album has no cover. Square viewBox | `COVER` 57.5,76 810.5x811, drawn between base and paper |
| `playlist/fonts/AnotherTypewriter.ttf` | Typewriter font, public domain (1001fonts "Another Typewriter") | album heading and song rows (`PLAYLIST.FONT_FAMILY`) |
| `playlist/fonts/AnotherTypewriter-EULA.txt` | Licence of the font (free for personal and commercial use, modification and redistribution) | n/a |
| `playlist/reference/cover-example.png` | Example cover from the artist, reference only, not shipped | n/a |
| `playlist/reference/preview.png` | Composed reference of the window, reference only, not shipped | n/a |

Font choice: Another Typewriter replaces Sue Ellen Francisco (see `docs/DECISIONS.md`, 2026-11-07). It is used only for the album heading and the song rows. "Track list" and the footer are painted in the artwork. Sizes are 32 px for the heading and 28 px for rows, with a 36 px row pitch, chosen from a rendered preview of four options.

## Album cover deck

Canvas 1874x1874 px at 2x, so the design size is 937x937 CSS px (the 3 transparent bottom rows were cropped so the window matches the player's height). Constants are in `ALBUM` in `app/src/shared/layout.ts`, measured with ImageMagick connected components (alpha). Layers are exported unresized from `source/album cover deck/album cover deck/` with `magick SRC -crop 1874x1874+0+0 +repage -strip -define png:compression-level=9 PNG32:OUT` (the crop drops the 3 transparent bottom rows of the 1874x1877 sources).

| File | What | Anchor (CSS px) |
|------|------|-----------------|
| `album/album-base.png` | Dark rounded panel (was `1. base.png`) | 0,0 937x937 |
| `album/album-buttons.png` | Tabs "Cassette Box", "J-Flap", "Lyric", display only (was `3. buttons with shadow.png`) | 0,0; tabs at y 880.5, x 76.5 / 214.5 / 352.5, each 130.5x37 |
| `album/album-top.png` | Window border, glass frame, minimize and close (was `4. top with glass and border and buttons.png`) | 0,0; glass hole 71.5,71.5 794.5x794; minimize 852.5,23.5 29.5x29; close 886,23.5 29x29 |

The cover is drawn between base and buttons at `COVER` 82.5,84.5 770x770 (2x 165,169 1540x1540, the alpha bbox of the sample art `2. reff art.png`, so it sits inside the glass hole). Shaded bar height is 62 (below the buttons, above the glass frame at 69.5). `source/album cover deck/album cover deck/2. reff art.png` (sample cover) and `preview for your eyes only.png` (composed look) are references only and are not shipped.

## App icon

| File | What | Where it goes |
|------|------|---------------|
| `icon/app-icon.svg` | Yellow coin with a stroked play triangle. Vector trace of the supplied `app_logo.jpeg` (coin measured in source px), cut off its grey backdrop and padded so the coin fills 88% of the square | Source for `app/build/icon.png` |

`app/build/icon.png` (1024x1024 RGBA) is rendered from it with `rsvg-convert -w 1024 -h 1024 assets/ui/icon/app-icon.svg -o app/build/icon.png`. electron-builder makes the macOS `.icns`, Windows `.ico` and Linux icons from that PNG, and the main process sets it as the player window's icon (Linux taskbar, dev runs).
