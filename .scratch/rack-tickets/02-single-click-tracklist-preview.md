# 02 · Single click slides out a tracklist preview

**Type:** feat · **Area:** `RackView.tsx/.css`, main `rack:*` IPC, preload, `shared/api.ts`

## Want
- One complete click on a spine opens a **tracklist preview** that **slides out from that spine**, like a J-card pulled out of a case.
- A click **anywhere else** (the shelf, another spine's empty area, the window chrome, the window losing focus) **slides it back in** and closes it.
- A click on another spine closes the open preview and opens that spine's preview.
- **Reuse the playlist's tracklist UI**: the same row markup, numbering (`01. Artist – Title`), duration column, Liberation Sans/Montserrat text styles and paper look as `PlaylistView` (`.pl-rows`, `.pl-row`, `.pl-name`, `.pl-dur`).

## Data: the rack has no tracks
`rack.json` stores only the spine art. The preview needs `Album.tracks`, so:
- Add an IPC `rackTracks(dir): Promise<Album | null>` (`rack:tracks`). Main validates `dir` with `dirArg`, accepts only a folder already in the rack, sends `scanAlbum {path}`, and resolves on the matching `albumInfo {path}` (timeout about 5 s, then `null`).
- `scanAlbum` already never touches playback (PROTOCOL.md), so the preview never interrupts what is playing.
- A missing folder (`album: null`) shows the empty state and goes through the same silent-remove rule as `rackPlay`. Confirm this with the user first: removing on preview may be surprising.
- Cache the last few results in the renderer to avoid a rescan on every click (optional).

## Reusing the playlist UI
- Extract the track-row list from `PlaylistView.tsx` (the `album?.tracks.map(...)` block, roughly lines 138-160) into a shared component, e.g. `views/TrackRows.tsx` with props `{ album, currentPath?, selected?, onRowClick? }`. `PlaylistView` keeps its own behaviour, and the rack passes a read-only or play-on-double-click handler.
- The CSS moves with it, or the rack imports the `pl-row` rules. Keep the playlist pixel-identical: compare a screenshot before and after.
- Recommended: a double-click on a preview row plays that track (`loadAlbum {path, index, play: true}`). Confirm with the user, because it was not asked for.

## Slide animation
- The panel is anchored to the clicked spine and slides out sideways, to the right, or to the left when near the right edge. Use a CSS `transform: translateX` / `clip-path` transition of about 200 ms ease-out, and reverse it on close (unmount after `transitionend`).
- It must stay inside the rack window (the shelf scrolls horizontally, so position it in shelf coordinates, or clamp it).

## Acceptance
- A single click opens the preview with the correct tracks for that album, and playback is not interrupted.
- An outside click, another spine, Escape or a window blur closes it with the slide-in animation.
- The playlist window looks and behaves unchanged.
- No preview opens during or after a drag (ticket 05).

## Tests
- Red first: a `node:test` for the main-side request/response matcher (the `albumInfo` for path A resolves only A's request; timeout gives null).
- Red first: the `rackIpc` tests cover `rack:tracks` rejecting a dir that is not in the rack.
- Playlist regression: the existing playlist tests stay green after the extraction.
- CDP: click a spine, `.rk-preview` appears with N rows equal to the album's track count, the engine status is unchanged, then a click on the shelf removes it.
