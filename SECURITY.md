# Security Policy

## Supported versions

Neural Chess is distributed via [GitHub Releases](https://github.com/bobathefetts/NeuralChess/releases).
Only the latest release receives fixes.

| Version | Supported |
| ------- | --------- |
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report it privately through GitHub's
[private vulnerability reporting](https://github.com/bobathefetts/NeuralChess/security/advisories/new)
(Security tab → Report a vulnerability). If that is unavailable, contact the
maintainer, [@bobathefetts](https://github.com/bobathefetts).

Please include:

- a description of the issue and its impact,
- steps to reproduce, and
- affected version and operating system.

You can expect an initial response within a few days. Thanks for helping keep
the project and its users safe.

## Security notes

- **API keys** are stored in the OS-encrypted credential store via Electron
  `safeStorage` in the desktop build and are injected into provider requests in
  the main process — they are not persisted in the renderer in desktop mode.
- **Builds are currently unsigned.** Installers and updates are verified by
  SHA-512 hash (from `latest.yml`) rather than by code signature. Windows
  SmartScreen will warn on first run; see the README for details.
- The renderer runs sandboxed with a restrictive Content-Security-Policy and no
  Node integration.
