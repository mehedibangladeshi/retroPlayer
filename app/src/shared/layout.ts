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

export const CHROME: { minimize: Rect; close: Rect; fullscreen: Rect } = {
  fullscreen: { x: 697, y: 7, w: 19, h: 19 },
  minimize: { x: 719, y: 7, w: 19, h: 19 },
  close: { x: 741, y: 7, w: 19, h: 19 },
}

/** Art for chrome boxes that are not baked into body-top-cover (path relative to assets/ui). */
export const CHROME_ART: { fullscreen: string } = { fullscreen: 'png/chrome-fullscreen.png' }

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
