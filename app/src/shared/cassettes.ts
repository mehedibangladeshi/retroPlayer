export const CASSETTE_DESIGNS = ['black', 'blue', 'cream', 'grey', 'pastel-green', 'red', 'white', 'yellow'] as const
export type CassetteDesign = (typeof CASSETTE_DESIGNS)[number]

export const isCassetteDesign = (v: unknown): v is CassetteDesign => (CASSETTE_DESIGNS as readonly unknown[]).includes(v)

export const randomDesign = (rand: () => number = Math.random): CassetteDesign =>
  CASSETTE_DESIGNS[Math.min(CASSETTE_DESIGNS.length - 1, Math.floor(rand() * CASSETTE_DESIGNS.length))]
