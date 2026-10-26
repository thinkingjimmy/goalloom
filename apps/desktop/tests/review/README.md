# review/

> L2 | Parent: [desktop](../README.md). Isolated regression and measurement fixtures; no real tasks or credentials.

- `run.mjs`: serial runner with one default regression list; explicitly selected scaling/large-workspace scenarios use Electron's Node/SQLite runtime.
- `renderer.mjs`: current-source Chromium with delayed IPC/imports and signed-out billing/cloud status that rejects mutations; local welcome choice, input/save revisions, late previews, pagination, search recovery, nested lazy-dialog visibility and draft-only composer calendar selection with first-level hover/focus guidance. Failures preserve the active page and original error. `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs --calendar` selects calendar interactions only and writes `calendar.json`.
- `lifecycle.mjs`: real Electron reload, close/reopen and crash maintenance release.
- `virtual.mjs`: real Electron long columns; bounded DOM, keyboard/pointer drag, read-only history targets, logical focus, search/detail-close focus return, folds and refresh counts.
- `wire.mjs`: real sandboxed preload rejects invalid dates/zones/extra fields in five languages and validates nested review contexts; accepts an optional packaged executable.
- `scaling.mjs`: three samples each at 200/400/800 items; rollover/undo integrity, SQL plans and growth curves.
- `large-workspace.mjs`: manual-only production commands and worker snapshots above SQLite's variable limit and at 100,000 items; latest-move and archive semantics.
- `package-report.mjs`: real report CLI with isolated synthetic ASAR/package trees; exact current archive, missing archive and stale unpacked version checks.
- `notarization.mjs`: real final verification Bash script, CLI and builder hook loader with synthetic Apple tools; upload/wait limits, saved IDs, bounded ticket connection-loss recovery, permanent-error rejection, secret redaction and app stapling before archive creation. Normal synthetic commands use a 3-second budget shared by all ticket attempts; intentional timeout probes retain 300 ms. Reports: `output/tests/notarization-fixture/`. No Apple requests or real signing credentials.
- `release-workflow.mjs`: static manual workflow graph, early provisioning/signing gate, preflight-only job skipping, read-only packaging, secret separation, cleanup and status summary. Reports: `output/tests/release-workflow/`. Hosted validation remains separate.
- `session-profile.mjs`: real provisioning CLI and Python plist parser with synthetic Apple boundaries; exact certificate selection, existing profile reuse, explicit creation, creation-only 403 recovery guidance and fail-closed behavior. Reports: `output/tests/session-profile/`. No Apple account or real credential access.

`pnpm test:review` and `node tests/review/run.mjs` share the renderer, lifecycle, virtual, wire, package-report and session-profile defaults. `pnpm verify` includes that default suite. `pnpm test:large-workspace` manually selects the 32,769/100,000-item check; no default development or release command includes it. Explicit group selectors remain supported, including `node tests/review/run.mjs large-workspace`. Notarization, scaling and performance remain separate explicit commands. Artifacts go to ignored `output/tests/review-fixes/`, `output/tests/review-followup/`, `output/tests/performance/`, `output/tests/packages/` and the fixture directories above.

`GOALLOOM_BENCH_REUSE=1` reuses the performance suite's synthetic seed; its original seed-time storage timings are not fresh phase measurements. `GOALLOOM_BENCH_LABEL` preserves each run, and `GOALLOOM_BENCH_ENTRY` can target a frozen build.

[PROTOCOL]: Update this header when making changes, then check README.md.
