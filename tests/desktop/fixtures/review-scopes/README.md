# review-scopes/

> Parent: [desktop acceptance](../../README.md).

- `index.html`: Test-only Vite entry for the native renderer.
- `renderer.tsx`: Mounts production review components with explicit month/combined period props and actual workspace write helpers; observes completion callbacks.

The production main, preload, SQLite and authoritative clock remain active. This harness verifies component workflows outside calendar-entry windows; it does not certify the natural App entry, App-owned completion feedback, or packaged desktop. Shared App lifecycle and celebration behavior retain the separate weekly completion evidence.

[PROTOCOL]: Update this header when making changes, then check README.md.
