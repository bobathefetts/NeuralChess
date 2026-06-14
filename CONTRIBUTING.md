# Contributing to Neural Chess

Thanks for your interest in contributing! Neural Chess is an LLM-vs-human chess
lab built with React, Vite, and Electron. This guide covers how to get set up
and the conventions we follow.

## Getting started

Prerequisites: **Node.js 22+** and npm.

```bash
git clone https://github.com/bobathefetts/NeuralChess.git
cd NeuralChess
npm install
npm run dev        # web renderer at http://localhost:5173
npm run desktop    # build + run the Electron app
```

See the [README](README.md) for the project layout and how the renderer, the
Electron main process, and the LLM provider adapters fit together.

## Quality gates

Please make sure these pass before opening a pull request:

```bash
npm run lint       # ESLint
npm test           # unit tests (node --test)
npm run test:e2e   # Electron end-to-end smoke tests (Playwright)
npm run build      # production renderer build
```

New behavior should come with tests where practical — pure logic lives in
`src/services/` and `electron/` and is straightforward to unit-test.

## Pull requests

1. Fork the repo and create a branch off `main` (e.g. `fix/illegal-move-retry`).
2. Keep changes focused; one logical change per PR.
3. Make the quality gates pass.
4. Fill out the pull request template, including screenshots for UI changes.

## Commit messages

Use clear, imperative subject lines (e.g. "Add promotion picker"). A short body
explaining the *why* is appreciated for non-trivial changes.

## Reporting bugs and requesting features

Use the issue templates (Bug report / Feature request). For questions and
open-ended ideas, start a thread in
[Discussions](https://github.com/bobathefetts/NeuralChess/discussions).

## Code of conduct

This project follows its [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.
