# Installing a test build

Test builds are unsigned, so each OS warns before the first run. Bundles come from the `package` workflow in GitHub Actions (download the artifact for your OS), or from a draft release.

## Linux (x64)

- **AppImage:** `chmod +x Cassette-Player-Retro-*.AppImage`, then run it. If it says FUSE is missing, install `libfuse2` (Ubuntu: `sudo apt install libfuse2t64`, or `libfuse2` on 22.04), or run it with `--appimage-extract-and-run`.
- **tar.gz:** extract it and run `./cassette-player-retro`.
- Needs glibc 2.34 or newer (Ubuntu 22.04+, Fedora 35+, Debian 12+) and ALSA (`libasound2`), which desktop distros already have.

## Windows (x64)

- **Installer:** run `Cassette-Player-Retro-*-win-x64.exe`. SmartScreen will say "Windows protected your PC": click **More info**, then **Run anyway**.
- **Zip:** extract it and run `Cassette Player Retro.exe`.

## macOS (Apple Silicon: `arm64`, Intel: `x64`)

1. Open the `.dmg` and drag Cassette Player Retro into Applications.
2. The first open is blocked ("cannot be opened" or "is damaged"). Fix it with either:
   - **System Settings → Privacy & Security**, scroll down, click **Open Anyway**; or
   - in Terminal: `xattr -cr "/Applications/Cassette Player Retro.app"`
3. Open it again.

## Settings and reset

The app saves its window size and position, full-screen state and last Open folder in `settings.json`. The file is in the app's user-data folder:

- Linux: `~/.config/Cassette Player Retro/`
- Windows: `%APPDATA%\Cassette Player Retro\`
- macOS: `~/Library/Application Support/Cassette Player Retro/`

To reset these to defaults, quit the app and delete `settings.json`.

## What to test

Follow the checklist in the hand-off message, or in short: open a FLAC, a WAV and an MP3 (click the cassette, use Ctrl/Cmd+O, or drag a file onto the window); try play, pause, stop, rewind and forward (click and hold); check the reels spin only while playing; try a broken file. Note your OS and version with any report.
