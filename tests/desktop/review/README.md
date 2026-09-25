# review/

> L2 | Parent: [desktop](../README.md). Isolated regression and measurement fixtures; no real tasks or credentials.

- `run.mjs`: serial runner; synthetic scaling/large-workspace scenarios use Electron's Node/SQLite runtime.
- `renderer.mjs`: current-source Chromium with delayed IPC; input/save revisions across closing/reopening, late previews, pagination and shortcuts.
- `lifecycle.mjs`: real Electron reload, close/reopen and crash maintenance release.
- `virtual.mjs`: real Electron long columns; bounded DOM, keyboard/pointer drag, read-only history targets, logical focus, folds and refresh counts.
- `wire.mjs`: real sandboxed preload rejects invalid dates/zones/extra fields in five languages; accepts an optional packaged executable.
- `scaling.mjs`: three samples each at 200/400/800 items; rollover/undo integrity, SQL plans and growth curves.
- `large-backup.mjs`: production storage worker; 360 long descriptions, protective reset and complete recovery above 100 MiB.
- `large-workspace.mjs`: production commands and worker snapshots above SQLite's variable limit and at 100,000 items; latest-move and archive semantics.
- `package-report.mjs`: real report CLI with isolated synthetic ASAR/package trees; exact current archive, missing archive and stale unpacked version checks.

`pnpm test:review` runs six regression groups and is included in `pnpm verify`. The large-backup, scaling and performance suites are separate explicit commands. Artifacts go to ignored `output/tests/review-fixes/`, `output/tests/review-followup/`, `output/tests/performance/` and `output/tests/packages/`.

Large-backup comparisons accept `GOALLOOM_LARGE_SEED` (only a closed synthetic workspace), `GOALLOOM_LARGE_WORKER` (a frozen production worker) and `GOALLOOM_LARGE_LABEL`. Launch each repetition as a new process. `GOALLOOM_BENCH_REUSE=1` reuses the performance suite's synthetic seed; its original seed-time storage timings are not fresh phase measurements. `GOALLOOM_BENCH_LABEL` preserves each run, and `GOALLOOM_BENCH_ENTRY` can target a frozen build.

[PROTOCOL]: Update this header when making changes, then check README.md.
