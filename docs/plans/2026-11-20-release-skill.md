# Plan: /release skill
Status: Complete

## Goal / Done when / Non-goals
Goal: a project `/release` skill that cuts a Cassette Player Retro beta release the way past releases were cut, with notes in the established style. Built with best practices from `anthropic-skills:skill-creator` and `superpowers:writing-skills`.

## Open questions
- [x] Q1 Location: committed `.claude/skills/release/`; `.gitignore` `.claude/` -> `.claude/*` + `!.claude/skills/`.
- [x] Q2 Scope: end to end; two gates: before pushing dev+main+tag, and before publishing the draft.
- [x] Q3 Script: small bump script. Minor decision: it lives at `scripts/release-bump.mjs` (repo convention, next to stage-sidecar.mjs) with pure exported functions tested by `app/test/releaseBump.test.ts` (so `pnpm test` and the pre-commit hook cover it); the skill calls it.
- [x] Q4 Readiness check: yes, verify each headline feature since the last tag is reachable; stop and ask if half-wired.
- [x] Q6 Versioning: the skill recommends a bump from commits since the last tag (breaking -> major, or minor while 0.x; any feat -> minor; fixes only -> patch) and channel beta by default; `/release` args (e.g. `minor stable`) pre-fill the choice; it always asks once to confirm. Beta = tag `vX.Y.Z-beta`, ordinal line, published `--prerelease`. Stable = tag `vX.Y.Z`, no ordinal/beta lines, published `--prerelease=false` (CI always drafts as prerelease; no CI change). The bump script computes the proposal (`nextVersion(current, kind)`) so it is tested.
- [x] Q5 Testing: node:test for the script + 2-3 with-skill dry-run evals graded against assertions and the captured no-skill baseline.

Known facts (from earlier in this session, git history and `gh release view`):
- Bump commit `build(release): bump the app and engine version to X for the <theme> release` touches app/package.json, engine/Cargo.toml, engine/Cargo.lock.
- Since 0.2.3: `chore: merge dev into main`, tag `vX.Y.Z-beta` on the merge commit (annotated since 0.3.1). CI `package.yml` checks tag vs app version, builds 4 bundles, makes a draft pre-release.
- Notes: "<Ordinal> beta of **Cassette Player: Retro**", download table, first-launch (unsigned), What's new, Known limitations. Ordinal = count of v*-beta tags.
- Baseline dry-run (no skill) got the flow mostly right but spent ~15 calls rediscovering it, guessed the ordinal, and added a Co-Authored-By trailer the git-commit skill forbids.

## Contracts
`scripts/release-bump.mjs` (style of scripts/stage-sidecar.mjs: header comment + usage, node: named imports, single quotes, no semicolons; CLI body runs only under `if (import.meta.main)` so tests can import it). Pure exports, each throws `Error` with a clear message on bad input / missing target:
- `nextVersion(current, kind)` kind `patch|minor|major` -> `X.Y.Z`
- `proposeKind(messages, current)` full commit messages since last tag -> `major|minor|patch`: breaking (`type(scope)!:` header or `BREAKING CHANGE:`) -> `major`, or `minor` when current major is 0; any `feat` header -> `minor`; else `patch`
- `setPackageVersion(text, v)` app/package.json top-level `"version"`
- `setWorkspaceVersion(text, v)` engine/Cargo.toml `version` under `[workspace.package]` only
- `setLockVersions(text, v)` engine/Cargo.lock `version` of `engine-sidecar` and `player-core` only
- `ordinal(n)` 1..20 -> `First`..`Twentieth`
CLI (cwd = repo root):
- `node scripts/release-bump.mjs propose` -> prints current version, last tag, proposed kind and next version
- `node scripts/release-bump.mjs bump <patch|minor|major|X.Y.Z>` -> rewrites the 3 files, prints `old -> new`
- `node scripts/release-bump.mjs ordinal` -> ordinal of the next beta = (count of `v*-beta` tags) + 1
Test: `app/test/releaseBump.test.ts` imports `../../scripts/release-bump.mjs` (style of app/test/ndjson.test.ts: node:test, node:assert/strict).

Skill: `.claude/skills/release/SKILL.md` + `.claude/skills/release/references/release-notes-template.md` (beta and stable variants).

## Waves
| # | Task | Tier | Own | Depends | Acceptance |
|---|---|---|---|---|---|
| 1.1 | bump script, test-first | sonnet | scripts/release-bump.mjs, app/test/releaseBump.test.ts | — | contract met; `pnpm test` + `pnpm lint` pass |
| 1.2 | SKILL.md + notes template | sonnet | .claude/skills/release/** | contract | <500 lines, best practices merged, 2 gates, readiness check, beta/stable |
| 1.3 | gitignore exception + CLAUDE.md pointer | haiku | .gitignore, CLAUDE.md | — | `git check-ignore` passes for worktrees, fails for skills |
| 2.1-2.3 | dry-run evals: next beta / `minor stable` / dirty tree | sonnet | scratchpad only | 1.1-1.3 | graded against assertions + baseline |
| 3.1 | fix eval findings (if any) | sonnet | .claude/skills/release/** | 2.x | evals re-pass |

## Log
- MAP: graphify — `graphify query "<q>"` from the main checkout (graphify-out/ is gitignored, absent in this worktree; possibly stale). Low value for this docs-only task.
- Baseline `git status --porcelain`: `?? docs/plans/2026-11-20-release-skill.md` (pnpm install run in worktree first).
- Status: Executing (wave 1). Launched 1.1 sonnet, 1.2 sonnet, 1.3 haiku.
- 1.1 done (sonnet): red then green, 342 pass, lint clean; propose -> minor 0.4.0, ordinal -> Eleventh.
- 1.2 done (sonnet): SKILL.md 116 lines + references/release-notes-template.md.
- 1.3 done (haiku): .gitignore exception + CLAUDE.md bullet; check-ignore 0/1 as expected.
- Status: Verifying (wave 1). Launched verifier (haiku) + reviewer (sonnet, 1.1+1.2).
- Verifier wave 1: OUTSIDE-OWN none; test/lint/typecheck pass; real `bump patch` changed exactly 4 lines, reverted.
- Reviewer: 1.1 no blockers. 1.2 blocker: dev not fast-forwarded to main after tag (tag unreachable from dev -> next propose uses old tag); minors: main checked out elsewhere, template link, gate (a) wording.
- Launched 1.2b haiku: apply the 4 review fixes to SKILL.md.
- 1.2b done (haiku): ff-only dev to main after tag (SKILL.md:51), worktree stop-and-ask, template link (:77), gate (a) local-only note; 117 lines.
- Status: Executing (wave 2). Launched evals 2.1 next beta, 2.2 `minor stable`, 2.3 dirty tree (all sonnet, dry run).
- Eval 2.1 next beta: PASS (script ordinal/propose, -a tag on merge, ff dev, gates, no trailer, full notes, readiness with file:line). Beats baseline.
- Eval 2.2 minor stable: PASS (v0.4.0, no beta wording, --prerelease=false, gates).
- Eval 2.3 dirty tree: PASS (stopped at step 1 under time pressure; no stash/commit).
- Launched 3.1 sonnet: fold eval gaps (worktree, ff failures, gate commands, CI --branch, CI failure recovery, notes sources, stable platform line, 3 stops).
- 3.1 done (sonnet): 8 eval gaps folded in; 117 lines.
- Final verifier: OUTSIDE-ALLOWED none; typecheck, lint pass; 342/342 tests; propose minor 0.4.0; ordinal Eleventh; check-ignore 0/1.
- Complete. Mix: 2 haiku builders (1.3, 1.2b) + 3 sonnet builders (1.1, 1.2, 3.1); 3 sonnet evals; 2 haiku verifiers, 1 sonnet reviewer; scouts 3 haiku. No escalations.
