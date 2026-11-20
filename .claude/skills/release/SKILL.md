---
name: release
description: Use when the user wants to cut, ship, tag or publish a release of Cassette Player Retro, bump the app version, make a beta or stable release, write release notes, or runs /release.
---

# Release

Cut a release of Cassette Player: Retro: bump the version on `dev`, merge into `main`, tag, push, let CI build the bundles, write tester notes, publish. Arguments (e.g. `minor stable`, `patch`, `0.4.0`, `beta`) pre-fill the version and channel choices.

Three stops in total: one combined version + channel question (step 2), gate (a) before the push, gate (b) before publishing the draft. The gates exist because they are the only public, hard-to-undo steps. Nothing else asks (except the stop-and-ask failures named below); everything before the push is local and runs without extra prompts. Never add a `Co-Authored-By` or any AI trailer to the bump commit (the `git-commit` skill rejects it) and never use `--no-verify` (the pre-commit hook runs typecheck, lint, tests, cargo test and clippy).

## Steps

### 1. Readiness check

1. Work from the checkout where `dev` is checked out. If the current checkout is not that one (e.g. you were invoked from another worktree), find it with `git worktree list` and run the release there. `git status` there must be clean; if not, stop and ask, and never stash, commit or discard the user's changes. Then `git fetch origin`. Local `dev` may be ahead of `origin/dev`; the push publishes those commits, so say so at gate (a).
2. Find the last tag and list what ships: `git log --oneline <lastTag>..dev`.
3. For every headline user-facing feature, verify it is reachable in the running app's code: the menu item is wired in `app/src/main`, an IPC handler is registered for every IPC call the renderer makes, the new function is actually called. A commit message saying "wired in a later commit" is a red flag: grep for that later commit.
   Real example: Lock Windows landed with "Main wires the behaviour in a later commit" and that commit never came. The menu checkbox did nothing and `IPC.getLocked` had no handler.
4. If anything is half-wired, stop and ask the user: finish it, ship without it, or hide it.

### 2. Version and channel

1. Run `node scripts/release-bump.mjs propose`. It prints the current version, last tag, and the proposed `patch|minor|major` and next version from the commits since the last tag (breaking -> major, or minor while on 0.x; any `feat` -> minor; else patch).
2. Ask the user once to confirm both the bump and the channel, pre-filled from the arguments. Beta is the default.

| | Beta | Stable |
|---|---|---|
| Tag | `vX.Y.Z-beta` | `vX.Y.Z` |
| Title | `Cassette Player: Retro X.Y.Z beta` | `Cassette Player: Retro X.Y.Z` |
| Notes | ordinal opening line, "Beta: tested on Linux..." limitation | no ordinal, no "beta" wording; keep the platform caveat as "Tested on Linux; the Windows and macOS builds are checked by automated window tests only." |
| Publish flag | `--prerelease` | `--prerelease=false` |

CI always creates the draft as a prerelease and needs no change; the publish flag fixes it.

3. Get the ordinal word for a beta with `node scripts/release-bump.mjs ordinal` (e.g. Eleventh). Do not guess it.
4. While waiting for the answer, draft the full change list for the notes (step 7) and show it with the question, so the user can correct it early.

### 3. Bump commit (local)

1. `node scripts/release-bump.mjs bump <patch|minor|major|X.Y.Z>` rewrites `app/package.json`, `engine/Cargo.toml` and `engine/Cargo.lock` and prints old -> new.
2. Check `git status --porcelain` shows exactly those three files. Forgetting `engine/Cargo.lock` makes the lockfile drift.
3. Commit with the `git-commit` skill: `build(release): bump the app and engine version to X.Y.Z for the <theme> release`. `<theme>` is a few words naming the release's main change.

### 4. Merge and tag (local)

```
git switch main && git pull --ff-only && git merge --no-ff dev -m "chore: merge dev into main"
git tag -a vX.Y.Z-beta -m "Cassette Player: Retro X.Y.Z beta"
git switch dev
git merge --ff-only main
```

Use `vX.Y.Z` and `Cassette Player: Retro X.Y.Z` for stable. Tag the merge commit on `main` (the tag is made while `main` is checked out, before switching back), not the bump commit on `dev`. Always annotated (`-a`), never lightweight. The last line fast-forwards `dev` to `main` so the new tag is reachable from `dev` (otherwise the next `propose` and notes range use the old tag). If `git pull --ff-only` on `main` fails (origin/main moved) or the fast-forward fails, stop and ask. If `git switch main` fails because `main` is checked out in another worktree, stop and ask the user rather than working around it.

### 5. Gate (a): push

Show the user: the version, channel, tag, the commits the push publishes (`git log --oneline origin/dev..dev` and `git log --oneline origin/main..main`, including any local-only `dev` commits), and that pushing starts CI. The bump commit, merge and tag from steps 3 and 4 are local only and can still be undone, which is why they need no extra confirmation. Ask for confirmation, then:

```
git push origin dev main <tag>
```

### 6. CI

```
gh run list --workflow package.yml --branch <tag> --limit 1
gh run watch <id> --exit-status
```

`--branch <tag>` picks the tag's run, not another workflow run. The `package` workflow runs a check job (typecheck, lint, tests, cargo test, clippy, and the tag base must equal `app/package.json`'s version), then four bundles, then a draft prerelease. It takes 12-20 minutes. Then `gh release view <tag>` must list all eight assets: `Cassette-Player-Retro-X.Y.Z-` followed by `win-x64.exe`, `win-x64.zip`, `mac-arm64.dmg`, `mac-arm64.zip`, `mac-x64.dmg`, `mac-x64.zip`, `linux-x86_64.AppImage`, `linux-x64.tar.gz`.

If CI fails, stop and report the failing job. The usual recovery is to fix on `dev` and cut the next patch version with a new tag. Never delete, move or re-push a tag without asking.

### 7. Release notes

Read [references/release-notes-template.md](references/release-notes-template.md) now: it has the exact structure, the verbatim download table and first-launch text, and the style rules. Cover every user-visible change since the last tag, not only what the user named: go through the whole log with bodies, `git log --format='%h %s%n%b' <lastTag>..dev` (some commits squash several changes into the body). Take the standing Known limitations from the previous release (`gh release view <lastTag>`), and check `docs/ASSETS_TODO.md` for placeholder art before writing a placeholder line. Never invent a limitation; ask if unsure. Write for testers (plain language, bold menu paths, bold area label with a colon per bullet, nested sub-bullets for big features, `**Fixes:**` last, no commit hashes, file names or internal terms). Keep standing known limitations, drop fixed ones, add new placeholder art or untested areas.

Write the notes to a file in the scratchpad directory, not in the repo.

### 8. Gate (b): publish

Show the user the notes and the change list, ask for confirmation, then:

```
gh release edit <tag> --title "<title>" --notes-file <file> --draft=false --prerelease        # beta
gh release edit <tag> --title "<title>" --notes-file <file> --draft=false --prerelease=false  # stable
```

Finish with `gh release view <tag>` and report the release URL.

## Quick reference

| Step | Command |
|---|---|
| Propose | `node scripts/release-bump.mjs propose` |
| Bump | `node scripts/release-bump.mjs bump <patch\|minor\|major\|X.Y.Z>` |
| Ordinal | `node scripts/release-bump.mjs ordinal` |
| Tag | `git tag -a vX.Y.Z-beta -m "Cassette Player: Retro X.Y.Z beta"` on the `main` merge commit |
| Push (gate a) | `git push origin dev main <tag>` |
| Watch CI | `gh run list --workflow package.yml --branch <tag> --limit 1`, `gh run watch <id> --exit-status` |
| Publish (gate b) | `gh release edit <tag> --title ... --notes-file <file> --draft=false --prerelease[=false]` |

## Common mistakes

| Mistake | Fix |
|---|---|
| Tagging the bump commit on `dev` | Tag the `chore: merge dev into main` commit while on `main` |
| Lightweight tag (`git tag vX.Y.Z`) | Use `git tag -a ... -m ...` |
| Forgetting `engine/Cargo.lock` | Use the bump script; `git status --porcelain` must show all three files |
| Adding `Co-Authored-By` or an AI trailer to the bump commit | None; the `git-commit` skill rejects it |
| Guessing the ordinal word | Run `node scripts/release-bump.mjs ordinal` |
| Notes list only what the user named | Walk the full `git log <lastTag>..<tag>` and list every user-visible change |
| Publishing a beta as a full release, or a stable as prerelease | Beta: `--prerelease`; stable: `--prerelease=false` |
| Shipping a half-wired feature (menu item without a handler) | Do the step 1 reachability check and ask |
| Tag base differs from `app/package.json` version | Bump first; CI's check job rejects a mismatch |
| Re-pushing or deleting a tag after a CI failure | Stop and ask |
