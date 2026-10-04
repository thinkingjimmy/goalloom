# Goalloom verification map

This directory is the maintained source for verifying user-facing Goalloom board behavior. Read this index, then follow one feature file literally.

## Baseline preconditions

- Build with `pnpm build` when `out/` is missing or older than the sources under test.
- Launch with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs launch` from the repository root.
- A fresh run opens the Chinese calendar step. Complete [First-run setup](./setup.md) before any feature that needs the board.
- `doctor` must report `worthDriving: true` and a profile under `output/tests/verify-goalloom/runs/`.
- Never drive an Electron process this run did not start, and never use the real Application Support / AppData directory.

## Driving conventions

- Start each feature from a fresh launch plus setup, unless that file says it continues the same board.
- Prefer the role and accessible name in the feature file. Keep quoted names and flags unchanged.
- `--name` is exact. `--name-pattern` is a regular expression. `--within-dialog` limits the search to that dialog.
- `Mod+` is Command on macOS and Control on Windows.
- Proof files stay under `output/tests/verify-goalloom/evidence/<feature>/`. Cleanup does not remove them.

## Proof and skip reporting

- Capture the control you used and the state after it, not only the last screen.
- UI proof is an ARIA snapshot plus a screenshot. The calendar screenshot shows the Goalloom welcome line; every ARIA file records `title: Goalloom`.
- A created or removed task is also recorded with `items`, which reads the open workspace.
- Record the feature file and the entry point you drove.
- If an entry point cannot be reached, report the command and the missing precondition. Do not mark it verified through a different control.

## Feature entry contract

Each feature file has an H1, one opening paragraph, then `Sub-features`, `How to get to it (user POV)`, `Driving it with goalloom-verify`, and `Gotchas`.

## Features

- [First-run setup](./setup.md) confirms the calendar, saves an annual direction, skips AI, and shows that direction on the board.
- [Capture a task](./capture.md) adds a task from a column header, a blank column, the column tail, and the composer.
- [Search](./search.md) opens search from the top bar and the keyboard, matches a title, and shows the empty state.
- [Later sidebar](./later.md) collapses and expands Later from the top bar and the keyboard.
- [Undo](./undo.md) creates a task and undoes it from the keyboard and from search.
