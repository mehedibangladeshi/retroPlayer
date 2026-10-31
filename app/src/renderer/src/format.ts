import type { ErrorCode } from '@shared/protocol'

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unsupported_format: 'This file format is not supported.',
  file_not_found: 'The file could not be found.',
  no_output_device: 'No audio output device is available.',
  decode_error: 'The file could not be decoded.',
  invalid_state: 'That action is not available right now.',
  bad_message: 'The player sent an invalid request.',
  internal: 'Something went wrong inside the player.',
  engine_crashed: 'The audio engine crashed and is restarting.'
}
