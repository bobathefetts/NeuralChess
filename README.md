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

## Logs And Crash Data

Structured logs are written to:

- Windows: `%APPDATA%/Neural Chess/logs/neural-chess.log`
- Electron runtime path: exposed in the app bootstrap and available from the UI through `OPEN LOGS`

Every log line is JSON and includes:

- timestamp
- level
- event
- metadata payload

Crash handling includes:

- `uncaughtException` in the main process
- `unhandledRejection` in the main process
- renderer process termination events
- child process termination events
- local crash reporter collection

## Update Manifest

The app checks for updates when `NEURAL_CHESS_UPDATE_URL` is configured for the desktop runtime.

Expected manifest format:

```json
{
  "version": "1.1.0",
  "notes": "Parser fixes, secure config migration, release diagnostics.",
  "downloadUrl": "https://example.com/NeuralChess-1.1.0.zip"
}
```

Current behavior:

- the app can detect a newer version
- the UI can open the configured download URL

Important:

- this is a manifest-driven updater hook, not a silent in-place installer
- true auto-install on Windows usually requires switching packaging strategy to an installer/update system such as Squirrel or NSIS-based tooling

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

The installer is currently unsigned, so Windows SmartScreen will warn on
first run. For public distribution, configure code signing through
electron-builder (`win.signtoolOptions` with an Authenticode certificate,
or Azure Trusted Signing).

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
  *.test.js

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
- verify `npm run build`
- verify live Ollama smoke test with at least one supported model
- set `NEURAL_CHESS_UPDATE_URL` for release builds if you want update checks
- confirm logs and crash files are being written on the target OS

## Known Limitations

- Move legality is enforced. Move quality is still model-dependent.
- Remote providers that require an explicit model name will fail if you leave the model blank.
- Update checks are implemented, but silent self-update is not.
- Browser mode cannot offer the same secret-storage guarantees as the Electron build.
