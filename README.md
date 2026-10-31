<p align="center">
  <img src="./apps/desktop/resources/icon.png" alt="Goalloom logo" width="112">
</p>

<h1 align="center">Goalloom</h1>

<p align="center"><strong>Connect a quarter's direction to today's to-dos.</strong></p>

<p align="center">
  Goalloom is an open-source, local-first to-do app for macOS and Windows, built around OKRs.<br>
  Time columns answer <em>when</em>; goal links answer <em>why</em>—so the goals that matter stop losing to whatever feels urgent.
</p>

<p align="center">
  <a href="https://github.com/thinkingjimmy/goalloom/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/thinkingjimmy/goalloom?display_name=tag&amp;sort=semver"></a>
  <a href="https://github.com/thinkingjimmy/goalloom/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/thinkingjimmy/goalloom?style=flat&amp;logo=github"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="https://www.goalloom.com">Website</a> ·
  <a href="https://github.com/thinkingjimmy/goalloom/releases/latest">Download</a> ·
  <a href="./docs/development.md">Development</a> ·
  <a href="./docs/features/">Feature specs</a> ·
  <a href="https://x.com/hellojimmywong">X</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="./docs/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="./docs/images/readme.jpg" alt="Goalloom's goal board: 3 months, this month, this week and today">
</p>

# Key features

- **Goals and today on one board.** Four time columns—3 months, this month, this week, today—put the quarter's goals beside today's work. A collapsible Later sidebar keeps unplanned ideas close at hand.
- **Two task levels, complete tasks.** Drag a task onto another, or press Tab in inline entry or the board title editor, to indent it. Shift+Tab makes it independent. Subtasks inherit goals and colors and keep their own details and status. Reschedule them independently; moving a parent carries only children scheduled with it.
- **Every to-do knows why.** Link an item to goals in longer horizons. Filter one goal (⌘1–⌘9) and relation lines draw its whole chain; hover any row to light its path. Links explain, they never roll up progress.
- **Write it down; Jev places it.** Optional Jev 1.14 smart input matches new tasks to your goals from Cmd+N and inline column entry. Enter saves immediately; a late answer can fill the column and parents. Manual edits win, and creation plus its automatic completion remains one undo step. Choose built-in AI with macOS Plus or bring your own key.
- **Nothing slips quietly.** Unfinished items roll over to the next period, and past periods stay readable and can be cleared in batches.
- **Undo anything, lose nothing.** Every change can be undone without touching your later edits; daily backups, plus safe restore and reset with a protective copy first.
- **Local-first and private.** Your workspace is a SQLite database on your computer, with no content telemetry. Optional Plus sync on macOS encrypts data before it leaves your device.
- **Made for the keyboard, in five languages.** ⌘N to capture, ⌘K to search, ⌘Z to undo. Chinese, English, Japanese, Spanish and French; paper, minimal or macOS 27 style, light or dark.

# Get started

## Download

[Download the latest release →](https://github.com/thinkingjimmy/goalloom/releases/latest)

| Platform | Version | Download |
| --- | --- | --- |
| macOS 14+ (Apple silicon) | 1.10.0 | [Goalloom-1.10.0-mac-arm64.dmg](https://github.com/thinkingjimmy/goalloom/releases/download/v1.10.0/Goalloom-1.10.0-mac-arm64.dmg) |
| Windows 11 (x64) | 1.9.10 | [Goalloom-1.9.10-win-x64.exe](https://github.com/thinkingjimmy/goalloom/releases/download/v1.9.10/Goalloom-1.9.10-win-x64.exe) |

Local features and BYOK stay free on both platforms. macOS 1.10.0 adds Plus encrypted sync and built-in AI for USD 8.99/month or USD 79/year. Start the one-time eight-day trial explicitly: no card is needed and it does not convert to a paid subscription automatically. Windows remains on 1.9.10 for local work and BYOK; this release does not add Windows Plus support. The iPhone app is not publicly released.

The macOS build is **Developer ID signed and notarized by Apple**. The Windows installer is **not code-signed**.

**macOS.** Open the DMG, drag Goalloom into `Applications`, then open it.

**Upgrading from the published macOS 1.8.0 build:** quit Goalloom and replace it with 1.10.0 in `Applications` once. Its old ad-hoc signature cannot use the new Developer ID update. Keep a local backup before upgrading.

**Windows.** SmartScreen shows "Windows protected your PC". Choose **More info**, then **Run anyway**, and follow the installer.

Your workspace lives in `~/Library/Application Support/Goalloom/` (macOS) or `%APPDATA%\Goalloom\` (Windows), with daily backups in `backups/`. Installing a newer version keeps it.

## Build from source

Requires Node.js 22.12 or newer and pnpm 11.9 (pinned in `package.json`; Corepack enables it).

```bash
git clone https://github.com/thinkingjimmy/goalloom.git
cd goalloom
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

To build local installers:

```bash
pnpm package:mac   # apps/desktop/release/Goalloom-<version>-mac-arm64.dmg
pnpm package:win   # apps/desktop/release/Goalloom-<version>-win-x64.exe
```

Published macOS 1.10.0 uses workspace format v14; Windows 1.9.10 uses v11. The macOS upgrade verifies a protective local backup before upgrading a v11 workspace. Keep that backup: 1.9.10 cannot open a v14 workspace. Use the same account and sync password for Plus. Some older cloud workspaces cannot be restored automatically; signing in again does not repair those copies. Keep the original local data and backups. See the [1.10.0 release notes](./docs/releases/v1.10.0.md). Build-time configuration is in the [development guide](./docs/build.md).



# Collaboration

Please use [GitHub Issues](https://github.com/thinkingjimmy/goalloom/issues) for bugs, feedback and proposals.



# License

The public desktop client and shared packages are MIT. The hosted backend is maintained separately. Earlier public history retains its original licenses.
