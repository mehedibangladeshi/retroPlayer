// Power deck import. Kept separate from openFile.ts so this module touches only window.retro
// and can be tested in node:test (openFile.ts pulls in the engine command module).

// One folder dialog at a time for this flow.
let dialogOpen = false

/** Add the chosen folder to the rack only. Never loads or plays. */
export async function importAlbumToRack(): Promise<void> {
  if (dialogOpen) return
  dialogOpen = true
  try {
    const path = await window.retro.openFolderDialog()
    if (path) window.retro.rackAdd([path])
  } finally {
    dialogOpen = false
  }
}
