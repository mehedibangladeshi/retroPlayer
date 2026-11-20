import { CHROME_SCALE } from '@shared/chrome'

/** Smallest composition (design px) of the free windows: the nine-slice caps (title, buttons, panel corners) stay whole
 *  and the playlist list area (150 px) fits its empty state or 3 rows, the rack's preview panel fits 3 rows. Shared by the renderer and main. */
export const FREE_MIN_COMP = { playlist: { w: 400, h: 395 }, rack: { w: 600, h: 323 } } as const

const up = (v: number): number => Math.ceil(Number(v.toFixed(6))) // 400 * 0.55 is 220.00000000000003

/** The matching smallest window (DIP): the composition drawn at CHROME_SCALE. */
export const freeMinWindow = (c: { w: number; h: number }): { width: number; height: number } =>
  ({ width: up(c.w * CHROME_SCALE), height: up(c.h * CHROME_SCALE) })
