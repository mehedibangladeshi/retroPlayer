# 06 · "Plus" spine at the end of the rack imports an album

**Type:** feat · **Area:** `RackView.tsx/.css`, preload/IPC (folder dialog)

## Want
- A **transparent "+" button** is always the **last item** in the rack row, after every spine (and the only item when the rack is empty).
- It has the **same shape and style as a cassette spine**: the same width (`spineW`), full height, the corner radius `0.104 × --sw`, and the inset outline (`::after`, the `#e0e0e0` stroke). The body is transparent or see-through, with a centred "+" glyph in the outline colour. It uses the same hover lift as ticket 03.
- Clicking it opens the native **folder** picker and **adds** the chosen album to the rack **without playing it**. This is the same rule as dropping a folder on the rack: `window.retro.rackAdd([path])` → main `scanAlbum` → spine appears. A single song cannot be picked because the dialog is folder-only.

## Approach
- Reuse `window.retro.openFolderDialog()` (main handler `IPC.openFolderDialog`, `properties: ['openDirectory']`, remembers the last folder), then `rackAdd([path])` if a path came back. Do **not** use `openAlbum()` from `input/openFile.ts`: it loads and plays.
- Render it outside `rack.spines.map` so it is never draggable, never a drop target for reorder, has no context menu entry and never gets `drop-before/after`. A drop on it of an OS folder can still add it (the stage handler already covers this).
- Accessible: `aria-label="Add album to rack"`, focusable, Enter/Space opens the dialog.
- A duplicate folder is a no-op (`record` already de-dups by `dir`; in Recent sort it bumps it, which is acceptable).

## Acceptance
- "+" is always last, scrolls with the row, matches the spine silhouette at any window size.
- Pick a folder → its spine appears before "+", and playback is unchanged. Cancel the dialog → nothing happens.

## Tests
- Red first: if any logic is added (e.g. a helper deciding the add path), a `node:test` for it. Otherwise this is a UI-only change: a CDP check that `.rk-add` is the last child of `.rk-shelf`, and a click calls `openFolderDialog` (stub it via `window.retro` in CDP) and then `rackAdd`.
- `dragRegions.test.ts` must stay green (no new `-webkit-app-region`).
