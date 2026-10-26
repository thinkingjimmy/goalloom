# review-scopes/

> Parent: [desktop acceptance](../../README.md).

- `index.html`: Test-only Vite entry for the native renderer.
- `renderer.tsx`: Mounts production review components with explicit month/combined period props and actual workspace write helpers; observes completion callbacks.
- `styles.css`: Imports production styles and explicitly scans renderer JSX for Tailwind utilities outside the harness root.

The production main, preload, SQLite and authoritative clock remain active. This harness verifies component workflows outside calendar-entry windows; it does not certify the natural App entry, App-owned completion feedback, or packaged desktop. Shared App lifecycle and celebration behavior retain the separate weekly completion evidence.

`review-scopes.mjs --outline` selects monthly record/closing order and 24px subtask indentation, including an independently completed parent. Evidence is in `output/tests/review-outline/month/`.

Combined planning still requires the month-start week to be current. The runner records a skip once that week expires, because the production period boundary rejects an expired planning destination. It does not change the clock or weaken the write guard to extend coverage.

[PROTOCOL]: Update this header when making changes, then check README.md.

`--combined --fixed-at=<canonical UTC ISO>` uses the separate test-clock composition in `../review-clock/`. Seed, main scheduling and worker observations share one immutable instant; the real preload and guarded commands remain. Both combined branches must execute without skips. Normal Electron quit/relaunch and a real expired-plan rejection are required. Evidence uses independent `runs/fixed-*` paths. Default runs keep their real-clock behavior and existing date skips.
