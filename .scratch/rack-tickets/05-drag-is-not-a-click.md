# 05 · Guard: a drag never opens the preview

**Type:** guard / acceptance rule for ticket 02 · **Area:** `RackView.tsx`

## Rule
While an album spine is being **dragged** (reordered in custom sort), **do not show** the tracklist preview. Only a **complete single click**, meaning press and release on the same spine with no drag in between, opens it.

## Cases to cover
- Mouse down → drag starts → drop on another slot: no preview, no play.
- Mouse down → drag starts → drop back on the same spine or cancelled with Esc: still no preview. Chromium can fire a `click` after a cancelled drag on some platforms, so guard it explicitly.
- Mouse down on spine A → move → release on spine B (no drag, e.g. in recent sort where `draggable` is false): no preview (not a complete click on one spine).
- A drag starting while a preview is open closes it first (slides in), so the ghost is not drawn over the preview.
- Hover lift (ticket 03) is suppressed during the drag.

## Approach
- `const dragging = useRef(false)`: set it in `onDragStart`, clear it in `onDragEnd` and on the next tick after `drop`. The click handler returns early when `dragging.current` is true or was set during this press (track it with a `pressId` from `pointerdown`).
- Keep the decision in a pure function, e.g. `spineClick({ detail, dragged, downOn, upOn }) → 'preview' | 'play' | null`, tested together with ticket 01's detail mapping.

## Tests
- Red first: `node:test` cases for every row above against `spineClick`.
- CDP: perform a reorder drag and assert `.rk-preview` never appeared (a MutationObserver records any appearance during the drag).
