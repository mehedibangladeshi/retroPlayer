// Pure rule for the knob's local value: show what the user just set until the engine echoes it (or a timeout).
export type Pending = { value: number; at: number } | null
export const PENDING_TIMEOUT_MS = 500

export const shownVolume = (pending: Pending, engine: number): number => (pending ? pending.value : engine)

/** Clear pending once the engine's volume equals it, or after the timeout so a lost echo cannot stick. */
export function settlePending(pending: Pending, engine: number, now: number): Pending {
  if (!pending) return null
  return Math.abs(engine - pending.value) < 0.001 || now - pending.at >= PENDING_TIMEOUT_MS ? null : pending
}

/** Volume the disc should show, or null while the engine's options are unknown (no fake angle); a user-set value is always real. */
export const knobVolume = (known: boolean, engine: number, pending: Pending): number | null =>
  known || pending ? shownVolume(pending, engine) : null
