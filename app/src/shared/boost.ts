/** Volume boost steps in dB; the engine clamps to 0..12. */
export const BOOST_STEPS = [0, 3, 6, 9, 12] as const

/** Next step, 12 wraps to 0; a value off the list goes to 0. */
export const nextBoost = (db: number): number => {
  const i = (BOOST_STEPS as readonly number[]).indexOf(db)
  return i < 0 ? 0 : BOOST_STEPS[(i + 1) % BOOST_STEPS.length]
}

/** One step up or down, clamped (no wrap); a value between steps lands on the nearest step that way. */
export const stepBoost = (db: number, dir: 1 | -1): number =>
  dir === 1 ? (BOOST_STEPS.find((s) => s > db) ?? 12) : ([...BOOST_STEPS].reverse().find((s) => s < db) ?? 0)

export const boostLabel = (db: number): string => (db === 0 ? 'OFF' : `+${db} dB`)
