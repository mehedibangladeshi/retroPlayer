import type { CassetteDesign } from '../../../shared/cassettes'
import type { RackState } from '../../../shared/rack'

/** Cassette layer files (relative to assets/ui); null is the original cassette. */
export function cassetteFiles(design: CassetteDesign | null): { base: string; mid: string; reel: string } {
  const p = design ? `png/cassette-${design}-` : 'png/cassette-'
  return { base: `${p}base.png`, mid: `${p}mid.png`, reel: `${p}reel.png` }
}

/** Design of the album in the deck; null for a single file, nothing, or an album with no design. */
export const nowPlayingDesign = (rack: RackState): CassetteDesign | null =>
  rack.spines.find((s) => s.dir === rack.nowPlaying)?.design ?? null
