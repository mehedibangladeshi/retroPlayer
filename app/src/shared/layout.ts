// Generated from assets/ui/source by task 2.3. All values are CSS px, origin = top-left of the window content area.
// PNGs under assets/ui/png are ASSET_SCALE (2x) of their rect. To regenerate, follow "How png/ was derived" in assets/ui/MANIFEST.md.
// No image imports here: this file is shared with the Electron main process; the renderer resolves the files itself.
export interface Rect { x: number; y: number; w: number; h: number }
export interface Circle { cx: number; cy: number; r: number }

export const WINDOW = { width: 767, height: 616 } as const
export const ASSET_SCALE = 2 as const

export type LayerId = 'bodyBase' | 'cassetteBase' | 'cassetteMid' | 'cassetteReel' | 'bodyTopCover' | 'bodyBottom' | 'bodyButtons'

/** Bottom to top paint order. `file` is relative to assets/ui. */
export const LAYERS: readonly { id: LayerId; file: string; rect: Rect }[] = [
  { id: 'bodyBase', file: 'png/body-base.png', rect: { x: 0, y: 0, w: 767, h: 616 } },
  { id: 'cassetteBase', file: 'png/cassette-base.png', rect: { x: 90, y: 85, w: 586, h: 342 } },
  { id: 'cassetteMid', file: 'png/cassette-mid.png', rect: { x: 90, y: 85, w: 586, h: 342 } },
  { id: 'cassetteReel', file: 'png/cassette-reel.png', rect: { x: 90, y: 85, w: 586, h: 342 } },
  { id: 'bodyTopCover', file: 'png/body-top-cover.png', rect: { x: 0, y: 0, w: 767, h: 616 } },
  { id: 'bodyBottom', file: 'png/body-bottom.png', rect: { x: 0, y: 0, w: 767, h: 616 } },
  { id: 'bodyButtons', file: 'png/body-buttons.png', rect: { x: 0, y: 0, w: 767, h: 616 } },
]

export const CASSETTE: Rect = { x: 90, y: 85, w: 586, h: 342 }
/** Hub centre and clip radius of each reel, in window coords. r is a clip circle (~3 px larger than the visible reel, r≈33) that isolates one reel in the shared reel layer. */
/** Centre and outer radius of each rotating reel graphic, in window coords. */
export const REELS: { left: Circle; right: Circle } = {
  left: { cx: 263.5, cy: 249, r: 36 },
  right: { cx: 512.5, cy: 249.5, r: 36 },
}

export type ButtonId = 'pause' | 'rewind' | 'play' | 'forward' | 'stop'
/** Alpha bbox of each key in the body-buttons layer (window coords). The PAUSE/REWIND/... text labels are NOT in that layer; they are baked into body-bottom. */
export const BUTTONS: Record<ButtonId, Rect> = {
  pause: { x: 158, y: 468, w: 89, h: 110 },
  rewind: { x: 250.5, y: 468, w: 89, h: 110 },
  play: { x: 345.5, y: 468, w: 89, h: 110 },
  forward: { x: 439.5, y: 468, w: 89, h: 110 },
  stop: { x: 532.5, y: 468, w: 89, h: 110 },
}

// Baked drop shadow of the key art extends this far (design px) past each BUTTONS rect (measured from body-buttons.png).
export const BUTTON_SHADOW_PAD = { right: 5, bottom: 7 }

export const CHROME: { minimize: Rect; close: Rect } = {
  minimize: { x: 719, y: 7, w: 19, h: 19 },
  close: { x: 741, y: 7, w: 19, h: 19 },
}

/** Text slots drawn over the cassette label (title strip) and next to "HIGH QUALITY AUDIO" (time). */
export const LABEL: { title: Rect; time: Rect } = {
  title: { x: 132, y: 130, w: 513, h: 30 },
  time: { x: 466, y: 434, w: 92, h: 14 },
}

/** Text baked into the body layers (bounding boxes of the glyphs). */
export const TEXT_MARKS: { brand: Rect; highQualityAudio: Rect } = {
  brand: { x: 92, y: 46, w: 186, h: 25 },
  highQualityAudio: { x: 564, y: 434, w: 113, h: 14 },
}

/** Album (cover-art) window. CSS px, art files are ASSET_SCALE (2x); measured with ImageMagick, see "Album cover deck" in assets/ui/MANIFEST.md. */
export const ALBUM = {
  WINDOW: { w: 937, h: 937 },
  ASSET_SCALE: 2,
  /** Paint order: base, cover, buttons, top. */
  LAYERS: [
    { id: 'base', file: 'album/album-base.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
    { id: 'buttons', file: 'album/album-buttons.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
    { id: 'top', file: 'album/album-top.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
  ],
  // Alpha bbox of the artist's sample art (2x 165,169 1540x1540), the intended cover placement.
  COVER: { x: 82.5, y: 84.5, w: 770, h: 770 },
  // Connected components of the top layer (2x 1705,47 59x58 and 1772,47 58x58).
  MINIMIZE: { x: 852.5, y: 23.5, w: 29.5, h: 29 },
  CLOSE: { x: 886, y: 23.5, w: 29, h: 29 },
  // Tab plates of the buttons layer (2x 153/429/705,1761 261x74); display only.
  TABS: [
    { x: 76.5, y: 880.5, w: 130.5, h: 37 },
    { x: 214.5, y: 880.5, w: 130.5, h: 37 },
    { x: 352.5, y: 880.5, w: 130.5, h: 37 },
  ],
} as const

/** Playlist window. CSS px, origin = top-left of the window; art files are ASSET_SCALE (2x) of their rect, paths relative to assets/ui. See "Playlist window" in assets/ui/MANIFEST.md. */
export const PLAYLIST = {
  // Layer canvas 1874x1874 px at 2x (cropped to the base body; y values below are 5.5 less than the 1874x1885 measurements in the notes).
  WINDOW: { w: 937, h: 937 },
  ASSET_SCALE: 2,
  /** Paint order bottom to top; the album cover is drawn between base and paper. */
  LAYERS: [
    { id: 'base', file: 'playlist/playlist-base.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
    { id: 'paper', file: 'playlist/playlist-paper.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
    { id: 'top', file: 'playlist/playlist-top.png', rect: { x: 0, y: 0, w: 937, h: 937 } },
  ],
  // Alpha bbox of reference/cover-example.png (2x 115,163 1621x1622).
  COVER: { x: 57.5, y: 76, w: 810.5, h: 811 },
  // Alpha bbox of playlist-paper.png (2x 141,183 1563x1581) inset by about 8 px for padding.
  TEXT_AREA: { x: 78.5, y: 94, w: 765.5, h: 774.5 },
  // Preview crop aligned to base (preview = art + (32,8) px at 2x on the cropped canvas); baseline y, colour sampled (#733638).
  TITLE: { x: 28, y: 44.5, fontSize: 36, color: '#733638' },
  // Preview text left x 232 and baseline 278; underline bar 2x 185..705, y 296..301.
  HEADING: { x: 100, y: 134.5, fontSize: 32, underline: { x: 92.5, y: 142.5, w: 260, h: 2.5 } },
  // First row "01." left x 253 baseline 397 in preview; baselines 397..787 over 6 rows give 65 px at 2x.
  // Sizes 32/28 chosen by eye from a rendered preview; pitch 36 fits the rows.
  ROW: { x: 110.5, y0: 194.5, pitch: 36, fontSize: 28 },
  // Preview "Side A and B Included" left x 127, baseline 1840; grey sampled from the glyphs.
  FOOTER: { x: 47.5, y: 916, fontSize: 10, color: '#5d5f66' },
  // Connected-component bboxes in playlist-top.png: minimize 2x 1724,40 60x60; close 1791,40 60x60.
  MINIMIZE: { x: 862, y: 14.5, w: 30, h: 30 },
  CLOSE: { x: 895.5, y: 14.5, w: 30, h: 30 },
  // Another Typewriter (public domain), file assets/ui/playlist/fonts/AnotherTypewriter.ttf; it has no '-', '…' or accented glyphs, so the view joins with an en dash and falls back to monospace.
  FONT_FAMILY: 'Another Typewriter',
} as const
