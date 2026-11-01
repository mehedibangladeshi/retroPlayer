// Key sounds: name -> file in assets/audio (dev) or resources/sounds (packaged).
// The main process loads each into the engine (`loadSound`); the renderer plays them by name.
export const SOUNDS = { click: 'button_click.mp3', stop: 'stop_button.mp3', seek: 'rewind_forward.mp3' } as const
export type SoundName = keyof typeof SOUNDS
