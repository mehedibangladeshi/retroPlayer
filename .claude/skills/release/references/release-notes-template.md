# Release notes template

Copy this into a scratchpad file, fill the placeholders, and pass it to `gh release edit --notes-file`. Replace `X.Y.Z` everywhere. Lines marked `[beta only]` are dropped for a stable release.

The notes are read by testers, not developers: plain language, menu paths in bold, no commit hashes, file names or internal terms.

---

Opening line, beta: `<Ordinal> beta of **Cassette Player: Retro**. <One-sentence summary of the biggest changes.>` (ordinal from `node scripts/release-bump.mjs ordinal`)
Opening line, stable: `**Cassette Player: Retro** X.Y.Z. <One-sentence summary of the biggest changes.>`

```markdown
<Opening line>

## Which file do I download?

| Your computer | Download |
|---|---|
| **Windows** (64-bit) | `Cassette-Player-Retro-X.Y.Z-win-x64.exe` (installer), or `…win-x64.zip` (no install, just extract and run) |
| **Mac with Apple Silicon** (M1/M2/M3/M4) | `Cassette-Player-Retro-X.Y.Z-mac-arm64.dmg` |
| **Mac with Intel** | `Cassette-Player-Retro-X.Y.Z-mac-x64.dmg` |
| **Linux** (64-bit) | `Cassette-Player-Retro-X.Y.Z-linux-x86_64.AppImage`, or `…linux-x64.tar.gz` |

Not sure which Mac you have? Apple menu → About This Mac: "Chip: Apple M…" means Apple Silicon, "Processor: Intel…" means Intel.

If you have an earlier version installed, X.Y.Z replaces it.

## First launch (builds are unsigned)

- **Windows:** SmartScreen says "Windows protected your PC". Click **More info**, then **Run anyway**.
- **macOS:** drag the app to Applications. The first open is blocked: go to **System Settings → Privacy & Security** and click **Open Anyway**, or run `xattr -cr "/Applications/Cassette Player Retro.app"` in Terminal.

## What's new

- **<Area>:** <what a tester can now do, in one or two sentences>.
  - <Sub-bullet for a big feature: one control, one gesture, one setting each.>
  - Set it from **Right-click → <Menu> → <Item>**.
- **<Area>:** <...>
- **Fixes:** <plain-language fixes, separated by sentences>.

## Known limitations

- <New placeholder art or area drawn by the app for now; final artwork comes later.>
- <Anything newly untested or intentionally unfinished.>
- Beta: tested on Linux; the Windows and macOS builds are checked by automated window tests only. [beta only]
- Tested on Linux; the Windows and macOS builds are checked by automated window tests only. [stable only, replaces the Beta line]
- Unsigned builds (see above).

Please report problems in Issues, with your OS and version.
```

## Style rules

- One bullet per user-visible change since the last tag, each starting with a bold area label and a colon. Keep the area labels consistent with earlier releases (Cassette rack, Volume knob, Windows, Keyboard Shortcuts, ...).
- Nest sub-bullets under a big feature; keep small changes to one line.
- Menu paths are bold with arrows: **Right-click → Windows → Reset Windows**. Keys are plain words (press L).
- **Fixes:** is always the last "What's new" bullet. Leave it out only if nothing was fixed.
- Known limitations: keep the standing lines, delete items this release fixed, add new placeholder art or untested areas. The `Beta:` line is `[beta only]`; stable keeps the caveat without the "Beta:" prefix.
- For a stable release use no ordinal and no "beta" wording anywhere.

## Example bullets (from 0.3.1)

- **Volume knob:** grab it and turn it around, like a real knob. It stops at 0 and 10, and a click still points it at the spot you clicked.
- **Volume boost** for quiet songs: Off, +3, +6, +9 or +12 dB.
  - Set it from the new **BOOST** lamp on the power deck (click to step, or use the mouse wheel) or from **right-click → Volume boost**.
  - The setting is remembered.
- **Fixes:** the right-click menu opens once per click again on Windows and stays open on Linux.
