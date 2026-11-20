/** One fixed scale for every side window's title bar and border, independent of window size (DIP). */
export const CHROME_SCALE = 0.55

/** Fixed DIP height of a side window's top bar. */
export const chromeBarPx = (barH: number): number => barH * CHROME_SCALE

/** Width / height of the part below the bar: the shape a bar window's body keeps at every size. */
export const bodyAspect = (designW: number, designH: number, barH: number): number => designW / (designH - barH)

/** Window height for a width: the body at its aspect plus the fixed bar. */
export const heightForWidth = (w: number, designW: number, designH: number, barH: number): number => w / bodyAspect(designW, designH, barH) + chromeBarPx(barH)

/** Window width for a height: the body (height minus the bar) at its aspect. */
export const widthForHeight = (h: number, designW: number, designH: number, barH: number): number => (h - chromeBarPx(barH)) * bodyAspect(designW, designH, barH)

/** Whole-window width / height at a window height `h`, for a body of `aspect` under a bar of `extraH`: what a native aspect lock needs. */
export const wholeAspect = (h: number, aspect: number, extraH: number): number => ((h - extraH) * aspect) / h
