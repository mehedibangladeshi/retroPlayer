/**
 * What a short click on Back does: restart the track, or go to the previous one.
 * `index` is the album position (null = single file, no album). Index 0 is not special:
 * the engine owns the play order and restarts the first track of it on `previous`.
 */
export function backAction(positionMs: number, index: number | null): 'restart' | 'prev' {
  return positionMs > 3000 || index === null ? 'restart' : 'prev'
}
