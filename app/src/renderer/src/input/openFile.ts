import { loadAndPlay } from '../engine/commands'

export async function openFile(): Promise<void> {
  const path = await window.retro.openFileDialog()
  if (path) loadAndPlay(path)
}
