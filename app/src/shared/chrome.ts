/** One fixed scale for every side window's title bar and border, independent of window size (DIP). */
export const CHROME_SCALE = 0.55

/** Fixed DIP height of a side window's top bar. */
export const chromeBarPx = (barH: number): number => barH * CHROME_SCALE
