---
name: verify-goalloom
description: >-
  Drive the Goalloom Electron desktop app in an isolated profile and prove a
  user-facing board feature. Use when verifying first-run setup, column capture,
  search, the Later sidebar, or undo against the real Goalloom window. Do not
  use it for the marketing site in website/.
---

# Verify Goalloom

Goalloom's primary surface is the local Electron board (macOS and Windows). The marketing site in `website/` is a separate Next.js app; use [website/README.md](../../../website/README.md) for that, not this skill. `pnpm dev` opens the real workspace at `~/Library/Application Support/Goalloom` (or `%APPDATA%\Goalloom`) and must not be driven.

The harness is `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs`. Run it from the repository root. It launches the built app with Playwright's Electron driver, the same isolation as `tests/desktop`: a private `--user-data-dir`, Chinese UI pinned in that profile, and no `ELECTRON_RENDERER_URL`. The single-instance lock follows the user-data directory, so a verification window can run beside the owner's real app. Two verification runs can run together only with different `--run` ids.

## Launch

From the repository root, with dependencies already installed:

```bash
pnpm build
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs launch
```

`pnpm build` refreshes `out/`. Skip it only when `out/main/index.js` is already newer than the sources under test. `launch` exits 0 when the window is ready. Stdout is JSON with `"ready": true` and `"surface": "onboarding"` for a fresh profile. The Electron process stays up after the command returns.

A fresh profile shows the calendar step (`欢迎来到 Goalloom`). Readiness is that screen, or the board if this run's profile was already confirmed. The page URL must start with `goalloom:`.

Optional second instance:

```bash
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs launch --run other
GOALLOOM_VERIFY_RUN=other node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs doctor
```

The default run id is `default`. `launch` refuses a run whose daemon is still alive.

## Doctor

Run this first whenever the window looks wrong, and again before trusting a proof:

```bash
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs doctor
```

Stdout JSON is worth driving only when `worthDriving` is true. That requires all of:

- the recorded daemon and Electron pids are alive, and the Electron command line contains this run's profile path
- the profile is under `output/tests/verify-goalloom/runs/` and is not `~/Library/Application Support/Goalloom` or `%APPDATA%\Goalloom`
- `workspace.sqlite` exists in that profile
- the document title is `Goalloom`, the URL starts with `goalloom:`, and `runtime.electron` matches `node_modules/electron/package.json`
- runtime SQLite is 3.x and the UI language is Chinese (`surface` is `onboarding` or `board`)

Save a copy with `--path output/tests/verify-goalloom/evidence/<feature>/doctor.json`. Do not drive a session that fails the doctor.

## Drive

Follow `.cursor/skills/verify-goalloom/features/` for the feature you are proving. Commands talk to the already-launched window. Prefer these role/name handles. `--name` is exact. `--name-pattern` is a JavaScript regular expression. `--within-dialog` scopes the lookup to a dialog accessible name.

```bash
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs settle
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "下一步"
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role radio --name-pattern "365 天"
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "这一年的方向" --value "验证这一年的方向"
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Mod+k
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role main --name "时间看板"
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait-text --text "没有找到条目"
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs get --role button --name "收起 Later" --attribute aria-expanded
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs dblclick --horizon day
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "撤销上一步" --within-dialog "搜索与命令"
```

`Mod+` is Command on macOS and Control on Windows. `dblclick --horizon` double-clicks the lower blank area of that column (`year`, `half`, `cycle`, `month`, `week`, `day`, or `later`), which is the hit target that opens quick add. A click expects exactly one match; an ambiguous control fails and includes an ARIA snapshot.

Do not call `window.goalloom.execute` or any other write bridge. The `items` command only reads `getSnapshot`.

## Evidence

Proof goes to `output/tests/verify-goalloom/evidence/<feature>/` (gitignored). The harness rejects a proof path outside that directory.

- Exercise the real controls. Do not seed rows through IPC, and do not point the profile at a real workspace.
- Capture the action and the resulting state. A final screenshot alone is not enough.
- UI proof is an ARIA snapshot (`aria --path ...`) plus a screenshot. The snapshot file starts with `title: Goalloom` and the `goalloom:` URL. The calendar step screenshot shows `欢迎来到 Goalloom`.
- After a write, `items --path ...` records titles, horizons, and calendar from the open app. That file is the stored-state check.
- Toasts last about 2.5 seconds. Pass `--shot <evidence path>` on the `wait-text` that sees the toast so the screenshot is taken in the same command.
- `doctor --path ...` records Electron, Node, SQLite, OS, and CPU for that run. Host physical-versus-VM status is not independently verified.

```bash
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/setup/calendar.png
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/setup/board.aria.txt
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs items --path output/tests/verify-goalloom/evidence/setup/items.json
```

## Cleanup

```bash
node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs cleanup
```

Cleanup asks the run's daemon to close Electron, then signals only the recorded daemon and Electron pids, and only if their command lines still contain this run's script or profile path. It deletes `output/tests/verify-goalloom/runs/<id>/` (profile, socket, log). It does not delete `output/tests/verify-goalloom/evidence/`. Run cleanup after a failed launch too; `launch` already does that when startup fails. Never `pkill` Electron or Goalloom.

## Helpers

The only helper is the harness above. `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs help` lists the commands. Feature recipes live in [features/README.md](features/README.md).
