# 04 · Bug: the drag ghost is huge while reordering

**Type:** bug · **Area:** `RackView.tsx/.css`

## Symptom
In custom sort, while dragging a spine to reorder it, the dragged spine (the drag image) becomes **extremely large**. It looks bad.

## Likely cause
The browser builds the default drag image from the element's untransformed layout box in design px, and ignores the ancestor `.rk { transform: scale(fit.scale) }`. Design px are much larger than the on-screen size when the window is scaled down, so the ghost appears enlarged (and with a high DPI it can be worse). Confirm with a CDP screenshot during a drag before you fix it.

## Want
The ghost is **always 5% larger than the spine looked on screen when the drag started**, at any window size, scale or DPI.

## Approach
- In `onDragStart`, measure `el.getBoundingClientRect()` (on-screen size, already scaled), and build the drag image at `1.05 ×` that size:
  - Clone the spine node into an off-screen container outside `.rk` (so no scale applies), with explicit `width/height = rect × 1.05` and `--sw` set to match. Call `e.dataTransfer.setDragImage(clone, offsetX × 1.05, offsetY × 1.05)` so the cursor keeps its grab point, and remove the clone on the next frame or on `dragend`.
  - Put the size math in a pure helper, e.g. `dragGhostBox(rect, clientX, clientY, 1.05) → {w, h, ox, oy}`.
- Optional: dim the source spine while it is being dragged (`.dragging { opacity: .4 }`) so the gap reads clearly.

## Acceptance
- At the smallest and largest window sizes, the ghost is 1.05× the on-screen spine (±1 px). The grab point stays under the cursor.
- No leftover clone nodes after a drop, a cancelled drag (Esc), or a drop outside the window.

## Tests
- Red first: a `node:test` for `dragGhostBox` (scales size and offset by 1.05, rounding).
- CDP: start a drag via `Input.dispatchDragEvent` (or with a manual check if CDP cannot show the OS drag image), and check that no `.rk-ghost` remains in the DOM after `dragend`. A visual check is a manual step: note it in the report.
