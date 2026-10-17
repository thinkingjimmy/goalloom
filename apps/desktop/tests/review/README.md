# review/

> L2 | Parent: [desktop](../README.md). Isolated regression and measurement fixtures; no real tasks or credentials.

- `run.mjs`: serial runner; synthetic scaling/large-workspace scenarios use Electron's Node/SQLite runtime.
- `renderer.mjs`: current-source Chromium with delayed IPC/imports; local welcome choice, input/save revisions, late previews, pagination, search recovery, nested lazy-dialog visibility and draft-only composer calendar selection. Failures preserve the active page and original error. `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs --calendar` selects calendar interactions only and writes `calendar.json`.
- `lifecycle.mjs`: real Electron reload, close/reopen and crash maintenance release.
- `virtual.mjs`: real Electron long columns; bounded DOM, keyboard/pointer drag, read-only history targets, logical focus, search/detail-close focus return, folds and refresh counts.
- `wire.mjs`: real sandboxed preload rejects invalid dates/zones/extra fields in five languages and validates nested review contexts; accepts an optional packaged executable.
- `scaling.mjs`: three samples each at 200/400/800 items; rollover/undo integrity, SQL plans and growth curves.
- `large-backup.mjs`: production storage worker; 360 long descriptions, protective reset and complete recovery above 100 MiB.
- `large-workspace.mjs`: production commands and worker snapshots above SQLite's variable limit and at 100,000 items; latest-move and archive semantics.
- `package-report.mjs`: real report CLI with isolated synthetic ASAR/package trees; exact current archive, missing archive and stale unpacked version checks.
- `notarization.mjs`: real CLI and builder hook loader with synthetic Apple tools; upload/wait limits, saved IDs, rejection/pending diagnostics, secret redaction and app stapling before archive creation. Normal synthetic commands use a 3-second budget; intentional timeout probes retain 300 ms. Reports: `output/tests/notarization-fixture/`. No Apple requests or real signing credentials.
- `session-profile.mjs`: real provisioning CLI and Python plist parser with synthetic Apple boundaries; exact certificate selection, existing profile reuse, explicit creation and fail-closed behavior. Reports: `output/tests/session-profile/`. No Apple account or real credential access.

`pnpm test:review` runs renderer, lifecycle, virtual, wire, large-workspace, package-report and session-profile groups and is included in `pnpm verify`. The notarization, large-backup, scaling and performance suites are separate explicit commands. Artifacts go to ignored `output/tests/review-fixes/`, `output/tests/review-followup/`, `output/tests/performance/`, `output/tests/packages/` and the fixture directories above.

Large-backup comparisons accept `GOALLOOM_LARGE_SEED` (only a closed synthetic workspace), `GOALLOOM_LARGE_WORKER` (a frozen production worker) and `GOALLOOM_LARGE_LABEL`. Launch each repetition as a new process. `GOALLOOM_BENCH_REUSE=1` reuses the performance suite's synthetic seed; its original seed-time storage timings are not fresh phase measurements. `GOALLOOM_BENCH_LABEL` preserves each run, and `GOALLOOM_BENCH_ENTRY` can target a frozen build.

[PROTOCOL]: Update this header when making changes, then check README.md.
