# 03 · Hover pulls the spine out of the shelf

**Type:** feat · **Area:** `RackView.css`

## Want
On mouse hover a spine **lifts**, as if pulled a little out of the rack towards the viewer.

## Approach (CSS only)
- `.rk .rk-spine { transition: transform 150ms ease-out, box-shadow 150ms ease-out; }`
- `.rk .rk-spine:hover { transform: translateY(calc(var(--sw) * -0.06)) scale(1.03); box-shadow: 0 calc(var(--sw)*0.06) calc(var(--sw)*0.12) rgba(0,0,0,.45); z-index: 1; }`
- Tune by eye against the shelf art. Use sizes in `--sw` units so the effect scales with the window.
- `.rk-shelf` has `overflow-y: hidden`, so a lift can be clipped at the top. Leave headroom (the shelf has a 24 px `SHELF_MARGIN`) and keep the lift inside it.
- The existing `:active { transform: translateY(1px) }` would cancel the hover transform. Merge them so a press reads as pushing it back in slightly.
- Turn the effect off while a drag is in progress (ticket 04/05), and on a spine whose preview is open (it is already "out").
- Respect `prefers-reduced-motion: reduce`: no transition, a smaller lift.

## Acceptance
- Hover lifts smoothly and un-hover settles back. It is not clipped, does not shift neighbours (transform only, no layout change), and does not flicker at the edges.

## Tests
- CSS only: no unit test is needed (a trivial change under the TDD rule). CDP check: hover a spine (`Input.dispatchMouseEvent mouseMoved`), and `getComputedStyle(spine).transform` is not `none`. Take a screenshot.
