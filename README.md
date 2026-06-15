<img width="1774" height="887" alt="ChatGPT Image Jun 15, 2026, 10_40_20 AM" src="https://github.com/user-attachments/assets/30cc94fc-dfc2-4051-907d-44c8aaf22ba5" />


# Neural Chess

Neural Chess is an LLM-vs-human chess app built with React, Vite, Electron, and `chess.js`.

This project is not trying to be Stockfish. The goal is to see how different language models reason about chess positions while still forcing them to produce legal moves.

## What It Does

- Lets you play chess against local Ollama models or remote providers.
- Forces move generation through a legal-move list and retry loop.
- Streams model output into the UI so you can watch how each model approaches the position.
- Supports `easy`, `normal`, and `hard` prompt profiles.
- Stores remote API keys in Electron secure storage when the desktop runtime is available.
- Writes structured logs and local crash data for release diagnostics.
- Checks a release manifest for newer builds and exposes download links in the app.

## Product Boundaries

This app is about legal move reliability and observable model behavior.

It is not:

- a classical chess engine
- a rating-calibrated strength benchmark
- a hidden-chain-of-thought extractor for providers that do not expose reasoning text

## Difficulty Profiles

Difficulty changes the prompt style and sampling parameters:

- `easy`: loose, chatty, higher temperature, fewer retries
- `normal`: balanced prompt, moderate temperature, standard retry budget
- `hard`: stricter tactical prompt, lower temperature, highest retry budget

These settings affect how the model is asked to think and how deterministic the sampling is. They do not turn a weak LLM into a strong chess engine.

## Provider Notes

### Ollama

- The selected model is required.
- Model discovery uses `http://localhost:11434/api/tags` by default.

### Remote Providers

- API keys are optional in the UI until you actually need them.
- Model selection is optional in the config.
- If you leave the model blank, the request only works if your provider accepts a default model.
- Official OpenAI and Anthropic endpoints usually require an explicit model name.

## Desktop Runtime

The Electron build is the recommended release target.

Desktop-only behavior:

- secure API key storage using Electron `safeStorage`
- structured JSONL logs in the app data directory
- crash capture via Electron crash reporter and process handlers
- release manifest update checks
- migration from older renderer `localStorage` config

## Security Model

Remote API keys are no longer persisted in renderer `localStorage` in desktop mode.

Instead:

- the renderer sends new keys through Electron IPC
- the main process encrypts and stores them with `safeStorage`
- move requests run through the main process, which injects the stored key at request time

If secure storage is unavailable on a desktop platform, the app refuses to persist the key.

Browser mode still falls back to local storage because there is no secure host process.

Additional desktop hardening:

- a `Content-Security-Policy` is injected by the main process: `script-src`
  is locked to `'self'` (no inline or remote scripts), with `object-src`,
  `frame-src`, and `form-action` denied. `connect-src` stays broad because
  the renderer reaches user-configured Ollama/provider endpoints directly.
- the renderer window runs with `sandbox: true` and `contextIsolation: true`
- in-app navigation is blocked; external `http(s)` links open in the system
  browser instead of inside the app window

## Logs And Crash Data

Structured logs are written to:

- Windows: `%APPDATA%/Neural Chess/logs/neural-chess.log`
- Electron runtime path: exposed in the app bootstrap and available from the UI through `OPEN LOGS`

Every log line is JSON and includes:

- timestamp
- level
- event
- metadata payload

Logs rotate by size: when `neural-chess.log` passes 5 MB it rolls to
`neural-chess.log.1` (keeping up to three backups), so the log directory is
bounded at roughly 20 MB.

Window size, position, and maximized state are remembered across launches.
If the saved position lands on a monitor that is no longer connected, the
window re-centers on a current display.

Crash handling includes:

- `uncaughtException` in the main process
- `unhandledRejection` in the main process
- renderer process termination events
- child process termination events
- local crash reporter collection

## Auto-Update

Updates use `electron-updater` against **GitHub Releases**. In a packaged
build the app checks for updates on launch and via the **CHECK UPDATES**
button; the flow is:

1. **CHECK UPDATES** → if a newer release exists, the status shows
   `vX AVAILABLE`.
2. **DOWNLOAD UPDATE** → downloads in the background with a live percentage.
3. **RESTART & INSTALL** → quits and installs the new version.

Updates only run in the packaged app (the renderer reports `disabled` in
browser/dev mode). Release notes from the GitHub Release are shown in the UI.

### Cutting a release

Releases are produced by the `Release` workflow (`.github/workflows/release.yml`).
Build and upload are decoupled: electron-builder only builds the installer
(`npm run release`, which runs `--publish never`), then the workflow uploads
the installer, its `.blockmap`, and `latest.yml` (the feed `electron-updater`
reads) to a GitHub Release with `softprops/action-gh-release`. This avoids a
race in electron-builder's own publisher that can drop the large installer.

```bash
# bump "version" in package.json first, then:
git tag v1.1.0
git push origin v1.1.0
```

`npm run release` builds the artifacts locally into `release/` without
publishing; the workflow handles the upload.

> Because builds are unsigned, the downloaded installer is verified by SHA-512
> hash from `latest.yml` (not by code-signature). Adding code signing later
> also enables signature verification on updates.

## Local Development

Install dependencies:

```bash
npm install
```

Run the web renderer:

```bash
npm run dev
```

Build the renderer:

```bash
npm run build
```

Run the desktop app:

```bash
npm run desktop
```

Run the quality gates:

```bash
npm run lint
npm test
```

Run the Electron end-to-end smoke tests (builds the renderer, then launches
the real app with Playwright):

```bash
npm run test:e2e
```

Load a custom starting position (handy for testing promotions and endgames):

```text
http://localhost:5173/?fen=8/P7/8/8/8/4k3/8/4K3%20w%20-%20-%200%201
```

## Electron Packaging

Current packaging command:

```bash
npm run package
```

This does the following:

1. builds the renderer in EXE mode (`VITE_APP_MODE=EXE`, local Ollama only)
2. packages the app with `electron-builder` into an NSIS installer at
   `release/Neural Chess-Setup-<version>.exe`

`npm run package:dir` produces an unpacked directory build for quick local checks.

The app icon lives in `build/icon.svg`; regenerate `build/icon.ico` with
`npm i --no-save sharp png-to-ico && node scripts/generate-icon.mjs`.

### Installing an unsigned build (SmartScreen)

The installer is currently **unsigned**, so Windows SmartScreen shows a
"Windows protected your PC" dialog on first run. To install:

1. Click **More info**.
2. Click **Run anyway**.

This is expected for an unsigned app and only appears until the publisher
builds reputation (see below).

### Adding code signing later

Signing is optional and intentionally not configured yet. Note that **since
August 2024 no certificate type — including EV — grants instant SmartScreen
trust**; reputation is built organically as the signed app accumulates clean
downloads. Signing is therefore necessary-but-not-sufficient to clear
SmartScreen, not an instant fix.

When you do want to sign, the recommended path is **Azure Artifact Signing**
(formerly "Trusted Signing"): roughly $10/month, cloud-based (no hardware
token), and open to self-employed individuals in the US/Canada/EU/UK. To wire
it into the build:

1. Create an Azure Artifact Signing account + certificate profile and pass
   identity validation.
2. Create a service principal with the "Trusted Signing Certificate Profile
   Signer" role.
3. Add an `azureSignOptions` block under `build.win` in `package.json` and
   provide `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` as
   environment variables (or CI secrets). electron-builder signs when those
   are present and builds unsigned when they are not.

A traditional OV/IV certificate (with the now-mandatory hardware token or a
cloud HSM) is the alternative; it produces the same organic-reputation
outcome at higher cost and setup effort.

The app was renamed from `chess-ai` to `Neural Chess`. On first launch the
main process migrates an existing `%APPDATA%/chess-ai/app-config.json` into
the new `%APPDATA%/Neural Chess` directory automatically.

If desktop startup fails before any window appears, check:

```bash
%APPDATA%\Neural Chess\boot.log
```

## Project Structure

```text
electron/
  main.js           Electron main process
  preload.cjs       Secure renderer bridge
  configStore.js    Versioned app config + secure key storage
  logger.js         Structured JSONL logging
  updateService.js  Manifest-based update checks

src/
  App.jsx
  components/
  hooks/
  services/
    llmCore.js      Prompting, provider adapters, stream parsing, move parsing
    llmService.js   Renderer/runtime routing for move requests
    runtimeBridge.js

tests/
  *.test.js           Unit tests (node --test)

e2e/
  *.spec.js           Electron smoke tests (Playwright)

scripts/
  generate-icon.mjs   Renders build/icon.svg to build/icon.ico
  reproduce_error.js  Move-parser smoke check
  test_play.js        Live Ollama self-play smoke test

build/
  icon.svg, icon.ico  App icon and electron-builder resources
```

## Release Checklist

- verify `npm run lint`
- verify `npm test`
- verify `npm run test:e2e`
- verify `npm run build`
- verify live Ollama smoke test with at least one supported model
- bump `version` in `package.json`, then push a `vX.Y.Z` tag to publish a release
- confirm logs and crash files are being written on the target OS

## Known Limitations

- Move legality is enforced. Move quality is still model-dependent.
- Remote providers that require an explicit model name will fail if you leave the model blank.
- Update checks are implemented, but silent self-update is not.
- Browser mode cannot offer the same secret-storage guarantees as the Electron build.
