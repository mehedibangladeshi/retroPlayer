/** What a short click on Back does: restart the track, or go to the previous one. */
export function backAction(positionMs: number, index: number | null): 'restart' | 'prev' {
  return positionMs > 3000 || index === null || index === 0 ? 'restart' : 'prev'
}
