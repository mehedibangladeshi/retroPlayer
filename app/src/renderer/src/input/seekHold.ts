/**
 * Sounds for one seek press. press() plays the key sound at once (click or hold);
 * the tape-motor loop starts on the first begin() (hold start) and stops once on end() if it began.
 */
export function createHoldMotor(
  playLoop: () => void,
  stopLoop: () => void,
  key: () => void
): { press: () => void; begin: () => void; end: () => void } {
  let on = false
  return {
    press: () => key(),
    begin: () => {
      if (on) return
      on = true
      playLoop()
    },
    end: () => {
      if (!on) return
      on = false
      stopLoop()
    }
  }
}
