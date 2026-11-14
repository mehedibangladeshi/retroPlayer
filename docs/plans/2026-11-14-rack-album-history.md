# Plan: Cassette rack album history (cover-art spines)
Status: Complete

## Goal / Done when / Non-goals
Goal: every imported album gets a cassette box in the cassette rack (a recent/history list). The box spine is a middle crop of the album cover, with the album name drawn on it in Montserrat, in a colour picked from the background for contrast. Clicking a spine loads that album and starts playing it.

Done when: importing two albums shows two spines (cover crop, readable Montserrat text); clicking one plays it; dropping a folder on the rack adds a spine without playing; a dropped single file adds nothing; right-click Sort Recent/Custom and Remove work; a Custom drag order survives restart and a switch back from Recent; a deleted folder's spine vanishes on click; typecheck, lint, pnpm test, cargo test, clippy pass; checked in the built app over CDP.

Non-goals: full-cover view, tooltips, cap/auto-prune, search/filter, multi-row wrap.

User edits after lock (2026-11-14): Remove from rack; drop album folder onto the rack adds it WITHOUT playing (needs new engine `scanAlbum`); single songs never get a spine; use Opus sub-agents where needed (overrides skill's haiku/sonnet-only tiers); TDD.

## Open questions
- [x] Q1 Ordering: the rack's right-click menu offers two sort modes, "Recent" (default, newest first, re-import/click moves to front) and "Custom" (user drags spines to reorder; the order is remembered and survives switching back to Recent and returning). Dedupe by album folder.
- [x] Q1b Custom mode: new albums append at the end. No cap; the user removes spines via right-click > Remove.
- [x] Q2 No cover: solid colour derived from the album name (stable per album); text colour picked for contrast like any spine.
- [x] Q3 Spine text "Artist - Album (Year)"; missing parts dropped, untagged title → folder name; ellipsis when too long.
- [x] Q4 (orchestrator) Main crops a full-height vertical strip from the cover's centre at the spine aspect (211:1527) with Electron `nativeImage`, resizes it small, stores it as a JPEG data URL in a separate `rack.json` in userData (not settings.json). No new dependency.
- [x] Q5 (orchestrator) Text colour: mean relative luminance of the strip (or name colour); black or white text, whichever has the higher WCAG contrast.
- [x] Q8 One row; each spine fills the shelf height (scales with the window), width = height × 211/1527; horizontal scroll (mouse wheel scrolls it sideways) when they overflow.
- [x] Q6 Missing folder on click: spine removed silently, nothing plays (matches session restore).
- [x] Q7 Right-click a spine > Remove.
- [x] Q9 (orchestrator) Recorded from main's `playlist` event when `album` is non-null (dialog, drop, restore, spine click all pass through). Single-file loads (`album: null`) make no spine.
- [x] Q10 (orchestrator) Drag-to-reorder only in Custom mode; in Recent mode spines don't drag. Clicking in Custom mode updates recency but not position.
- [x] Q11 (orchestrator) Font: reuse the already-bundled `assets/ui/playlist/fonts/Montserrat-VariableFont_wght.ttf` (byte-identical to `assets/font/Montserrat/`).
- [x] Q12 (orchestrator) Spine mask and outline drawn in CSS (rounded rect + thin light inset line) from the reference geometry; the 8000x5000 PNGs are reference only, moved to `assets/ui/source/cassette spine/`.

Design reference (`assets/ui/cassette spine/`, 8000x5000 canvas, px):
- `2 bg.png`: black rounded-rect mask, bbox (7,5)-(218,1532), 211x1527.
- `3 bg outer line.png`: thin light outline, bbox (15,18)-(210,1518), inset ~8-13 px.
- `4 name reff.png`: name rotated 90° clockwise (reads top to bottom), bbox (76,321)-(142,1109), centred horizontally.
- `1 refferance.png`: composed example, cover crop filling the mask.

## Contracts

### Engine protocol (task 1.1)
- Command `scanAlbum {path}`: reads the folder like `loadAlbum` (`scan_album`) but never touches playback or the current playlist. Always answers with exactly one `albumInfo` event; never emits `error`.
- Event `albumInfo {path, album: WireAlbum | null}`: `path` echoes the command; `album` null when the scan fails (missing, not a folder, no playable audio). Not acted on by the renderer store (ignored).
- Rust: `Command::ScanAlbum { path: String }`, `Event::AlbumInfo { path: String, album: Option<WireAlbum> }`. TS: matching members in `app/src/shared/protocol.ts`; `isValidCommand` (`app/src/main/ndjson.ts`) accepts it.

### Shared types — `app/src/shared/rack.ts` (task 1.2)
```ts
export type SortMode = 'recent' | 'custom'
export interface Spine {
  dir: string            // album folder = identity
  text: string           // "Artist - Album (Year)"
  image: string | null   // cropped strip, JPEG data URL; null = no cover
  bg: string             // '#rrggbb'; name colour (no cover) or strip's mean colour
  ink: '#000000' | '#ffffff'
}
export interface RackState { sort: SortMode; spines: Spine[] }  // spines already in display order
export const SPINE_ASPECT = 211 / 1527   // width / height, from assets/ui/cassette spine/2 bg.png
```

### IPC — `app/src/shared/api.ts` + `app/src/preload/index.ts` (task 1.2)
RetroApi additions (IPC names in `IPC`):
- `getRack(): Promise<RackState>` — `rack:get` (invoke)
- `onRack(cb: (s: RackState) => void): () => void` — `rack:changed` (main → rack window push)
- `rackPlay(dir: string): void` — `rack:play`
- `rackAdd(dirs: string[]): void` — `rack:add` (paths dropped on the rack; main keeps only directories)
- `rackReorder(dirs: string[]): void` — `rack:reorder` (full custom order after a drag)
- `rackMenu(dir: string | null): void` — `rack:menu` (right-click; dir = spine under the pointer, null = empty shelf)

### Main pure module — `app/src/main/rack.ts` (task 1.2, node:test in `app/test/rack.test.ts`)
```ts
export interface RackEntry extends Spine { lastUsed: number }
export interface RackFile { sort: SortMode; entries: RackEntry[] }   // array order = custom order
export function parseRack(raw: unknown): RackFile                    // hand-validated; bad input -> {sort:'recent', entries:[]}
export function spineText(a: { dir: string; title: string|null; artist: string|null; year: string|null }): string
export function nameColor(text: string): string                      // stable '#rrggbb' from a string hash
export function meanRgb(bgra: Uint8Array): [number, number, number]  // nativeImage.toBitmap() is BGRA
export function inkFor(rgb: [number, number, number]): '#000000' | '#ffffff'   // higher WCAG contrast
export function hexRgb(hex: string): [number, number, number]
export function spineCrop(w: number, h: number): { x: number; y: number; width: number; height: number } // centre strip at SPINE_ASPECT, full height (or full width if image is narrower)
export function record(f: RackFile, s: Spine, now: number): RackFile // upsert by dir: existing keeps position, refreshes visuals + lastUsed; new appended at end
export function remove(f: RackFile, dir: string): RackFile
export function reorder(f: RackFile, dirs: string[]): RackFile       // unknown dirs ignored; entries not listed keep relative order at the end
export function setSort(f: RackFile, sort: SortMode): RackFile
export function view(f: RackFile): RackState                         // recent: lastUsed desc; custom: array order
```

### Main wiring (task 2.1, opus)
- `app/src/main/rackStore.ts`: `loadRack()/saveRack(f)` on `join(userData,'rack.json')`, atomic tmp+rename like settings.ts; `makeSpine(album: Album): Spine` via `nativeImage.createFromDataURL(cover).crop(spineCrop)` → resize height 400 → `toJPEG(82)` data URL; ink/bg from `meanRgb(toBitmap())`; no cover or bad image → `bg = nameColor(text)`.
- `index.ts`: on `playlist` with album and on `albumInfo` with album → `record(makeSpine)`, save, push `rack:changed` to `rack.win` if live. IPC handlers guarded by `fromAppWindow(e)` and arg validation (strings / string arrays). `rack:play`: folder missing → `remove`, save, push; else `sidecar.send({v:1,type:'loadAlbum',path:dir})`. `rack:add`: each existing directory → `scanAlbum`. `rack:menu`: `Menu.popup` on the rack window: radio "Sort: Recent", "Sort: Custom", and when dir given a separator + "Remove from rack".

### Renderer (task 2.2, opus)
- `RackView.tsx/.css`: one row of spines inside the inner shelf (`RACK` inner panel scaled by fit), spine height = shelf height, width = height × SPINE_ASPECT, `overflow-x:auto`, wheel → horizontal scroll. Spine = rounded rect (radius and inset outline proportional to the 211×1527 reference: outline ~4-6 % inset, thin light line), `image` as `background-size:cover` or `bg` colour, text rotated 90° clockwise reading top-to-bottom, starting ~21 % from the top, Montserrat, colour `ink`, ellipsis. Click → `rackPlay`; contextmenu → `rackMenu(dir|null)`; HTML5 drag-reorder only when `sort==='custom'` → `rackReorder`. OS drop of folders (webkitGetAsEntry().isDirectory) → `rackAdd(paths)`; files ignored; preventDefault on dragover/drop so the window never navigates. No `-webkit-app-region` added (dragRegions test).
- Pure helper `views/rackOrder.ts`: `moveDir(dirs, from, to)` with `app/test/rackOrder.test.ts`.

## Waves

| # | Task | Tier | Files owned | Depends on | Acceptance |
|---|------|------|-------------|------------|------------|
| 1.1 | Engine `scanAlbum` → `albumInfo` (TDD: stdio tests first) | sonnet | engine/crates/engine-sidecar/src/{protocol.rs,main.rs}, engine-sidecar/tests/album.rs, docs/PROTOCOL.md, app/src/shared/protocol.ts, app/src/main/ndjson.ts, app/test/ndjson.test.ts, app/src/renderer/src/engine/store.ts | — | tests: scan ok → albumInfo with album, no playlist/state change; missing/empty → album null, no error; validator accepts scanAlbum |
| 1.2 | Shared rack types, IPC/preload surface, pure `main/rack.ts` (TDD) | sonnet | app/src/shared/rack.ts, app/src/shared/api.ts, app/src/preload/index.ts, app/src/main/rack.ts, app/test/rack.test.ts | — | rack.test.ts covers record/remove/reorder/view/parse/crop/ink/nameColor/spineText; typecheck passes |
| 2.1 | Main wiring: rackStore + index.ts hooks, IPC, menu | opus | app/src/main/rackStore.ts, app/src/main/index.ts | 1.1, 1.2 | playlist/albumInfo record spines; rack:play/add/reorder/menu work; missing folder removed; args validated |
| 2.2 | RackView spines, scroll, click, menu, drag-reorder, folder drop (TDD on rackOrder) | opus | app/src/renderer/src/views/RackView.tsx, RackView.css, views/rackOrder.ts, app/test/rackOrder.test.ts | 1.2 | renders RackState per contract; dragRegions test passes; rackOrder tests pass |
| 3.1 | Docs + reference move | haiku | docs/DECISIONS.md, assets/ui/MANIFEST.md, CONTEXT.md, docs/ARCHITECTURE.md, assets/ui/cassette spine/ → assets/ui/source/cassette spine/ | 2.1, 2.2 | entries match contract; PNGs moved |
| 3.2 | Live CDP check of built app (read-only, scratch only) | sonnet | scratchpad only | 2.1, 2.2 | report per done-criterion: pass/fail with evidence |

## Waves

## Log
- MAP: none
- Baseline git status: ?? assets/ui/all basic cassette/, ?? assets/ui/cassette spine/, ?? assets/ui/source/album cover deck/, ?? assets/ui/updated send 9-11-26/, ?? docs/plans/2026-11-14-rack-album-history.md
- Approved 2026-11-14 ("go ahead").
- W1 launch: 1.1 sonnet (engine scanAlbum), 1.2 sonnet (rack types/IPC/pure module).
- 1.1 done (sonnet): scanAlbum/albumInfo; cargo test, clippy, typecheck, lint pass; tests red first.
- 1.2 done (sonnet): shared/rack.ts, api/preload, main/rack.ts, 18 tests; pnpm test 217 pass.
- W1 verify: haiku verifier + sonnet reviewer launched.
- W1 verified: verifier all pass, no outside-Own; reviewer no blockers (minor: scan runs on sidecar command thread; albumInfo carries full cover data URL).
- W2 launch: 2.1 opus (main wiring), 2.2 opus (RackView).
- 2.1 done (opus): rackStore.ts, rackIpc.ts (+4 tests red→green), index.ts wiring; typecheck/lint/build pass.
- 2.2 done (opus): RackView spines, rackOrder (+tests red→green); deviation: used Liberation Sans because appFont.test forbids non-playlist fonts; geometry guessed.
- 2.3 added (sonnet): appFont test rack exception (TDD) + Montserrat + measured spine geometry. Own: app/test/appFont.test.ts, RackView.tsx/.css.
- Reviewer for 2.1 launched (sonnet).
- 2.1 review: no blockers. Minor: statSync throw in rackAdd (fixed); restore bumps album to Recent top each launch (accepted: it is the last-played album anyway).
- VERIFY fix 2.1 (4 lines): rackAdd statSync wrapped in try with throwIfNoEntry:false.
- 2.3 done (sonnet): appFont rack exception (red→green), Montserrat 300, measured geometry; 226 tests pass, build ok.
- W3 launch: 3.1 haiku (docs), 3.2 sonnet (live CDP check), reviewer sonnet for 2.2/2.3.
- 3.1 done (haiku): docs + CONTEXT.md + reference moved to assets/ui/source/cassette spine/; lint pass.
- 2.2/2.3 review: no blockers. Minors: stale gap on drop off-spine (fixed), index-based drag (fixed), many data-URL backgrounds for hundreds of albums (follow-up), font test is source-string only (matches playlist).
- VERIFY fix 2.2 (3 lines): clear gap when not over a spine; drag payload is dir, not index.
- 3.2 done (sonnet): live CDP checks a–g all PASS; screenshot in scratchpad. Not covered live: OS drag-drop onto rack, native context menu (menu template unit-tested).
- Final verify (haiku): no outside-Own; typecheck, lint, 226 JS tests, cargo test, clippy, build all pass.
- Complete. Actual mix: 1 haiku builder, 4 sonnet builders (1.1, 1.2, 2.3, 3.2), 2 opus builders; plus haiku verifiers, sonnet reviewers/scouts. Escalation: 2.3 added to restore Montserrat after appFont test blocked 2.2. VERIFY fixes: 2.1 (4 lines), 2.2 (3 lines).
