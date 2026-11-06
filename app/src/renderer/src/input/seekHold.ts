/** Tape-motor loop for one seek press: loops on the first begin(), stops once on end() if it began. */
export function createHoldMotor(playLoop: () => void, stopLoop: () => void): { begin: () => void; end: () => void } {
  let on = false
  return {
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
