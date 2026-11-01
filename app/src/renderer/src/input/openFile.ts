import { loadAlbum, loadAndPlay } from '../engine/commands'

// One native dialog at a time, shared by the file and folder flows.
let dialogOpen = false
async function once(run: () => Promise<void>): Promise<void> {
  if (dialogOpen) return
  dialogOpen = true
  try {
    await run()
  } finally {
    dialogOpen = false
  }
}

export const openFile = (): Promise<void> =>
  once(async () => {
    const path = await window.retro.openFileDialog()
    if (path) loadAndPlay(path)
  })

export const openAlbum = (): Promise<void> =>
  once(async () => {
    const path = await window.retro.openFolderDialog()
    if (path) loadAlbum(path)
  })
