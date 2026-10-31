import type { Status } from '@shared/protocol'
import type { ButtonId } from '@shared/layout'

/** Which transport buttons are disabled for a given engine status. */
export function transportDisabled(status: Status): Record<ButtonId, boolean> {
  const loaded = status !== 'empty'
  const playing = status === 'playing'
  return {
    pause: !playing,
    rewind: !loaded,
    play: !loaded || playing,
    forward: !loaded,
    stop: !(playing || status === 'paused')
  }
}
