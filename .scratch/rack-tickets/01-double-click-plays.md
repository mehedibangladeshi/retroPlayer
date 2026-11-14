# 01 · Double-click a spine to load and play

**Type:** feat · **Area:** `RackView.tsx`

## Now
One click on a spine calls `rackPlay(dir)` and starts the album playing.

## Want
- **Double-click** loads the album on the player and plays it (the current `rackPlay` path: a missing folder is removed silently, otherwise `loadAlbum` with play).
- A single click no longer plays anything. It opens the preview (ticket 02).

## Approach
- Use the playlist's rule: `e.detail >= 2` means a double-click (`rowClickAction` in `views/rowKeys.ts`). Either reuse it directly or add a small `spineClickAction(detail)` next to it.
- The first click of a double-click also fires as `detail 1`, so it opens the preview. Decide: the double-click closes the preview it just opened (recommended, since the album is now playing), or it leaves it open.
- Keyboard: Enter or Space on a focused spine fires `detail 0`. Pick one: it plays (like the playlist's Enter) or it toggles the preview. Recommended: Enter plays, Space previews.

## Acceptance
- A double-click plays the album, and the player and playlist show it.
- A single click never sends `rack:play`.
- In custom sort, a double-click does not start a drag or reorder anything.

## Tests
- Red first: a `node:test` for the click mapping (detail 1 → preview, detail 2 → play, detail 0 → the keyboard choice).
- CDP: dispatch `dblclick` on a spine, and the engine state becomes Playing on that album's first track.
