# Plan: Album edit, cassette designs, lock fixes
Status: Complete

Worktree: ../retroPlayer-album-edit (branch feat/album-edit from dev 44014f1). Untracked assets copied in: `assets/ui/all basic cassette/`, `assets/ui/edit_window/`.

## Goal / Done when / Non-goals
Goal: 8 items from the user's batch (cassette designs, random per-album assignment, album edit window + entry points, visualizer lock/persistence fix, rack hover glow, playlist border drag under lock).

## Open questions
- [x] Cassette assets: 8 sets, 1783x1040 RGBA, base/mid/reel map 1:1 to cassetteBase/Mid/Reel. Resize to 1172x684 into png/ (MANIFEST magick cmd). CSS redraw of all 9 cassettes = separate follow-up plan (user OK'd split).
- [x] Pool: 8 new designs for albums; singles + empty deck keep current cassette; rack albums w/o design get one on next load.
- [x] Edit window: separate frameless dialog window, never docks/locks/restores, single instance. New WINDOWS.md section.
- [x] Album key: rack entry `dir`. Per-album fields live on RackEntry (optional in parseRack; record() must carry them over).
- [x] Custom cover: copied+downscaled into userData/covers; used by album window AND spine.
- [x] Item 8 (playlist border drag under lock): user said skip. Non-goal.
- [x] Item 6: persist visualizer mode globally in settings options. Freeze only on Windows (works on Linux) -> blind fix + Windows CI E2E check.
- [x] Ref image "Add/Edit J-plap" (J-card): skip, non-goal.

## Contracts
```ts
// app/src/shared/cassettes.ts (new, task 1.2)
export const CASSETTE_DESIGNS = ['black','blue','cream','grey','pastel-green','red','white','yellow'] as const
export type CassetteDesign = (typeof CASSETTE_DESIGNS)[number]
export function isCassetteDesign(v: unknown): v is CassetteDesign
export function randomDesign(rand: () => number = Math.random): CassetteDesign
// PNG files (task 1.1): assets/ui/png/cassette-<design>-{base,mid,reel}.png, 1172x684. Existing cassette-{base,mid,reel}.png untouched (= original cassette).

// app/src/shared/rack.ts (task 1.2)
export interface AlbumCustom {
  cover?: string        // file name inside userData/covers/ (never a path)
  spineOffset?: number  // 0..1 crop-window position along the cover's free axis; 0.5 = centred (default)
  spineColor?: string   // '#rrggbb'; when set the spine is this solid colour, no image
  ink?: string          // '#rrggbb' spine text colour override
  text?: string         // spine text override
}
Spine = { dir; text; image: string|null; bg: string; ink: string /*#rrggbb, widened*/; design: CassetteDesign|null }
// app/src/main/rack.ts: RackEntry gains `design?: CassetteDesign; custom?: AlbumCustom` (both optional in parseRack, invalid values dropped not the entry)
//   record(file, spine, now, rand?) keeps old.design/custom/resume; assigns randomDesign(rand) when no design yet
//   editAlbum(file, dir, spine, design, custom): RackFile  — replaces that entry's spine fields + design + custom
//   spineCrop(w, h, offset = 0.5); view() sends design
// app/src/main/rackStore.ts: makeSpine(album, custom?: AlbumCustom, coverDataUrl?: string) — coverDataUrl overrides album.cover; applies offset/spineColor/ink/text

// app/src/shared/api.ts additions
// task 1.3:
getVisualizerMode(): Promise<'bars'|'wave'>; setVisualizerMode(m: 'bars'|'wave'): void   // settings.json `visualizerMode`
// task 2.1:
export interface AlbumEditState { dir: string; defaultText: string; cover: string|null /*data URL: custom cover else folder cover*/; design: CassetteDesign|null; custom: AlbumCustom }
export interface AlbumEditSave { dir: string; design: CassetteDesign; custom: AlbumCustom; coverToken?: string }
openAlbumEdit(dir: string): void                       // opens/retargets the single edit window
getAlbumEdit(): Promise<AlbumEditState|null>          // edit window asks for its target
onAlbumEdit(cb: (s: AlbumEditState) => void): () => void  // retarget while open
pickAlbumCover(): Promise<{ token: string; dataUrl: string } | null>  // main opens dialog, reads+downscales; renderer never sends a path
saveAlbumEdit(save: AlbumEditSave): Promise<void>     // main validates, writes covers/<hash>.jpg, rebuilds spine, saves rack
closeAlbumEdit(): void
```
Edit window: hash `#edit`, frameless, not in `satellites`, not docked/locked/persisted; drag strip + close per WINDOWS.md.

## Waves
| # | Task | Tier | Own | Deps |
|---|---|---|---|---|
| 1.1 | Resize 8 cassette sets to png/, MANIFEST | haiku | assets/ui/png/cassette-*-*.png, assets/ui/MANIFEST.md | — |
| 1.2 | Design + custom data model, random assign, crop offset, makeSpine overrides | sonnet | shared/cassettes.ts, shared/rack.ts, main/rack.ts, main/rackStore.ts, app/test/rack*.test.ts, app/test/cassettes.test.ts | — |
| 1.3 | Persist visualizer mode | sonnet | main/settings.ts, main/index.ts (only the 2 IPC handlers), shared/api.ts, preload/index.ts, PowerVisualizer.tsx, app/test/settings*.test.ts | — |
| 2.1 | Edit window main side, IPC, cover import, artwork override, menus | opus (security: user-picked image file, IPC trust boundary) | main/index.ts, main/albumEdit.ts (new), main/contextMenu.ts, main/rackIpc.ts, shared/api.ts, preload/index.ts, app/test/albumEdit.test.ts | 1.2, 1.3 |
| 2.2 | Deck draws the album's design | sonnet | views/CassettePlayer.tsx, shared/layout.ts, app/test/cassetteLayers.test.ts | 1.1, 1.2 |
| 2.3 | Windows visualizer-under-lock fix + E2E check | opus (5-6 unsplittable blind debugging) | views/PowerView.css, views/power/PowerVisualizer.css, scripts/e2e/dock.mjs | 1.3 |
| 3.1 | Album Edit view (HTML/CSS after ref) | sonnet | views/EditView.tsx+.css (new), App.tsx, app/test/dragRegions.test.ts, app/test/editView*.test.ts | 2.1 |
| 3.2 | Rack hover Edit button + glow | sonnet | views/RackView.tsx, views/RackView.css | 2.1 |
| 3.3 | Docs | haiku | docs/WINDOWS.md, docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/plans/2026-11-21-css-cassettes.md (new stub) | 2.1 |

## Log
- Baseline porcelain: ?? assets/ui/all basic cassette/ · ?? assets/ui/edit_window/ · ?? docs/plans/2026-11-21-album-edit-batch.md (+ CONTEXT.md edit by orchestrator)
- MAP: worktree has no graphify-out (untracked); builders use grep. Main repo graph: — `graphify query "<q>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify section "<heading>"` (fresh: graph.json 12:16 after last commit 12:15)
- Approved 2026-11-21. pnpm install run in worktree.
- W1 launched: 1.1 haiku, 1.2 sonnet, 1.3 sonnet.
- 1.1 done (haiku): 24 PNGs 1172x684, MANIFEST subsection.
- 1.3 done (sonnet): IPC ui:getVisualizerMode/ui:setVisualizerMode; parseVisualizerMode in shared/api.ts; lint errs were in 1.2's rack.ts (in progress).
- 2.3 launched early (opus), deps 1.3 met.
- 1.2 done (sonnet): record(f,s:SpineBase,now,rand?), editAlbum(f,dir,s,design,custom), makeSpine(album,custom?,coverDataUrl?):SpineBase; SpineBase=Omit<Spine,'design'> from main/rack.ts. Caller must load custom.cover file → coverDataUrl. Tests written after impl (TDD deviation, flagged).
- W1 verify launched: haiku verifier + sonnet reviewer.
- W1 verified: outside-own none; typecheck/lint/test 359 pass. Review minors: 1.3 load race → VERIFY fix 1.3 (3 lines, touched ref). Others (NaN offset direct callers, empty custom) accepted.
- W2 launched: 2.1 opus (security), 2.2 sonnet; 2.3 opus still live.
- 2.2 done (sonnet): cassetteDesign.ts cassetteFiles/nowPlayingDesign + test; CassettePlayer subscribes to rack; 362 pass; build ok (vite dedupes identical PNGs). TDD order deviation flagged.
- 2.1 done (opus): IPC edit:open/get/changed/pickCover/save/close; window 760x532; albumEdit.ts pure (deps injected); 374 pass. Security review + 2.2 review launched.
- Orchestrator read full 2.1 diff: sender checks, name-from-main, token, 50MB cap, nav/open handlers OK. Awaiting opus security review.
- 2.2 review: getRack/onRack race → VERIFY fix 2.2 (4 lines). Per-layer fallback minor accepted.
- 2.1 security review: no blockers; 5 minors. Sent 1-4 back to 2.1 builder (dir must equal editDir; stale pick; decode bomb >10k px; COVER_NAME → .jpg only). #5 (orphan covers GC) → follow-up.
- 3.3 launched (haiku, docs).
- 3.3 done (haiku): WINDOWS/ARCHITECTURE/DECISIONS (g placeholder) + css-cassettes stub. 3.1 launched (sonnet).
- 2.1 security fixes done (376 pass); orchestrator spot-checked: editing param, stale pick guard, coverTooLarge, .jpg-only. Residual: full decode before size check (user's own file) → follow-up.
- 3.2 launched (sonnet).
- 3.2 done (sonnet): .rk-spine-wrap + sibling .rk-edit button; glow + playing:hover combined. Risk to review: wrapper div vs drag-reorder/layout code.
- 3.1 done (sonnet): EditView/editForm (+6 tests written first), #edit route, dragRegions row; build pass. Review of 3.1+3.2 launched.
- 3.1+3.2 review: 3.2 BLOCKER offsetLeft (preview placement) + hover minor → retry 3.2 (sonnet). 3.1 getAlbumEdit race + url quoting → retry 3.1 (sonnet).
- 3.1 retry done: race guard + quoted urls; checks pass.
- 3.2 retry done: wrap offsetLeft, hover rules on wrap; 387 pass. Waiting on 2.3 before final verify (avoid concurrent builds).
- 2.3 done (opus): .pd::after no-drag box (CSS only) + dock.mjs real-click lock step; root cause svg box not collected + later imgs inherit drag; repro'd on Linux X11. dock E2E: 1 unrelated-looking FAIL 'snap resize aspect album bottom 5px off'. VERIFY fix 3.3 (2 lines): DECISIONS (g) filled.
- Final: verifier (full suite + baseline dock E2E on main), 2.3 reviewer, runtime CDP checker launched.
- 2.3 review: no blockers; minor: E2E step lacks try/finally unlock → follow-up.
- Final verifier: outside-own none; typecheck/lint/387 tests/cargo test/clippy/build pass. Dock 'snap resize bottom 5px' FAIL also on main baseline → pre-existing.
- Runtime CDP: 1,3,4(save/validation),5,7,8 PASS; 2/4 deck live switch FAIL (pushRack only to rack.win). VERIFY fix 2.1 (2 lines): pushRack also sends to player win. 6 skipped (native menu).
- Runtime recheck: deck switches design live on play and on save. PASS.
- CLOSE: tiers 2 haiku (1.1, 3.3) · 5 sonnet · 2 opus, as planned; retries: 2.1 security fixes (opus), 3.1 + 3.2 review fixes (sonnet). VERIFY fixes: 1.3, 2.2, 3.3, 2.1 (each ≤5 lines).
- Follow-ups: delete orphaned userData/covers files; read image dimensions from the header before decoding; try/finally unlock in the dock.mjs visualizer step; spine Edit-button lift under reduced motion; clearer on/off look for the solid-colour toggle; dock E2E "snap resize bottom 5px" fails on main too; Windows CI run of dock-e2e to confirm 2.3; CSS cassette redraw plan (docs/plans/2026-11-21-css-cassettes.md).
