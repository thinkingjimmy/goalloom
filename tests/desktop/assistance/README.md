# assistance/

> L2 | Parent: [desktop tests](../README.md)

`pnpm test:assistance` runs all seven owning groups. Pass `entry`, `generation`, `apply`, `undo`, `recovery`, `language` or `statistics` to select development feedback.

- `run.mjs`: Sequential feature dispatcher; no live provider or release-wide verification.
- `data.ts`: Real Repository/SQLite commands, owned undo, import/upgrade boundaries and bounded statistics with an injected clock.
- `review.ts`: Import atomicity including event-free unlink, historical clear/undo, lifecycle effectiveness, nanosecond/DST date boundaries, upgrade appearance and counted 50,000-item rollover validation. Runs with `undo`, `recovery` and/or `statistics`.
- `native.mjs`: Production UI, synthetic HTTP, retained multi-turn inputs/outputs, intent switches/drafts, cancellation, consent, receipts, focus and five-locale/four-appearance geometry.
- `legacy.ts`: Synthetic v7 fixture without guidance, with saved dark/minimal/tint appearance.
- `upgrade.mjs`: Actual production startup with scripted native-dialog choices and unchanged-source checks.
- `regression.mjs`: Deduplicated affected legacy suites; optional command-name selectors retain prior results.

Evidence: `output/tests/assistance/`. Runtime: Electron/Node/SQLite and host OS/CPU are recorded. Dialog decisions and composition events are synthetic. Physical IME, installer upgrades, Windows and live quality are separate gates.

Review evidence: `review-before.json`, `conversation-before.json` and `reschedule-before.json` retain failures before the fixes. `review-report.json` records final data checks and effect-read counts; `native-report.json` and `reschedule-entry.png` / `undone-completion.png` record the native corrections. The default batch is 50,000 items; `GOALLOOM_REVIEW_BATCH_SIZE=1000 pnpm test:assistance recovery` provides smaller development feedback.

[PROTOCOL]: Update this header when making changes, then check README.md.
