# Development setup

The same repo builds on Linux, macOS and Windows. Each machine builds the bundles for its own OS. CI (`.github/workflows/package.yml`) builds all of them for releases.

## macOS

1. **Xcode Command Line Tools** (C linker for Rust): `xcode-select --install`
2. **Rust** (stable, via rustup): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **Node 26** (the version in `.nvmrc`): `brew install node@26`, or with a version manager: `fnm install` / `nvm install` in the repo.
4. **pnpm 12** (the version pinned in `package.json`): `npm install -g pnpm@12.16.1`. Node 25+ no longer ships Corepack, so `corepack enable` won't work.
5. **Git identity**, the same as on the other machine:
   `git config --global user.name "Mehedi Hasan"` and `git config --global user.email mehedipy@gmail.com`

Then, from the repo root:

```sh
git clone git@github.com:mehedibangladeshi/retroPlayer.git && cd retroPlayer
pnpm install
pnpm dev          # builds the engine (debug) and opens the app
pnpm package      # .dmg and .zip for this Mac's CPU, in app/dist/
```

A bundle you build yourself is not quarantined, so it opens without the Gatekeeper prompt testers see.

### Building for the other Mac CPU

`pnpm package` builds for the Mac you are on. To build the Intel version on an Apple Silicon Mac (or the reverse, with `aarch64-apple-darwin` and `--arm64`):

```sh
rustup target add x86_64-apple-darwin
node scripts/stage-sidecar.mjs --target x86_64-apple-darwin
pnpm --filter app build
pnpm --filter app exec electron-builder --mac --x64
```

The engine binary and the Electron app must be the same CPU type, which is why both steps name the architecture.

## Linux

Needs the ALSA headers for the audio output crate (`libasound2-dev` on Debian/Ubuntu, `alsa-lib` on Arch/Fedora), plus Rust, Node 26 and pnpm 12 as above. `pnpm package` produces an AppImage and a tar.gz.

## Windows

Needs Rust with the MSVC toolchain (Visual Studio Build Tools, "Desktop development with C++"), Node 26 and pnpm 12. `pnpm package` produces an NSIS installer and a zip.

## Checks before committing

```sh
pnpm typecheck && pnpm lint && pnpm test
cargo test --manifest-path engine/Cargo.toml --workspace
cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings
```

`cargo test ... -p player-core -- --ignored` also runs the tests that play a short tone through the real audio device. These are worth running on each OS.

## Pre-commit hook and TDD

`scripts/git-hooks/pre-commit` runs, in order: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `cargo test --workspace` and clippy with `-D warnings`. The first failure blocks the commit. It is enabled by `pnpm install`, whose `prepare` script sets `core.hooksPath` to `scripts/git-hooks`. Run it by hand with `scripts/git-hooks/pre-commit`. Do not bypass it with `--no-verify`.

The test-first rule (red, green, refactor) is in AGENTS.md, "How to work", item 8.

## Releases

Bump `version` in `app/package.json` and `engine/Cargo.toml`, then push a tag such as `v0.1.3-beta`. The `package` workflow's `check` job runs the checks above and stops the run if the tag (without `v` and the `-suffix`) differs from `app/package.json`'s version. Only then are the bundles built and a draft release created.

Release builds of the sidecar use fat LTO, one codegen unit and stripping (`[profile.release]` in `engine/Cargo.toml`), so they take longer than debug builds. React is a dev dependency because Vite bundles it into `out/renderer`; anything the main process needs at runtime must stay in `dependencies`, or it won't be in `app.asar`.
