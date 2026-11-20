import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importAlbumToRack } from '../src/renderer/src/input/importAlbum.ts'

function stubRetro(folder: string | null) {
  const calls: string[] = []
  const retro = {
    openFolderDialog: async () => {
      calls.push('openFolderDialog')
      return folder
    },
    rackAdd: (dirs: string[]) => calls.push(`rackAdd:${dirs.join(',')}`),
    send: (cmd: { type: string }) => calls.push(`send:${cmd.type}`),
  }
  ;(globalThis as { window?: unknown }).window = { retro }
  return calls
}

test('importAlbumToRack: adds the chosen folder to the rack and sends no engine command', async () => {
  const calls = stubRetro('/music/album')
  await importAlbumToRack()
  assert.deepEqual(calls, ['openFolderDialog', 'rackAdd:/music/album'])
})

test('importAlbumToRack: cancelled dialog does nothing', async () => {
  const calls = stubRetro(null)
  await importAlbumToRack()
  assert.deepEqual(calls, ['openFolderDialog'])
})
