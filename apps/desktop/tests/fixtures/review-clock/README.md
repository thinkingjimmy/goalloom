# review-clock/

INPUT: One explicit canonical UTC test instant and fresh isolated profiles.
OUTPUT: Production App/client/worker flows with matching fixed workspace observations and independent evidence.
POS: Native review test composition only. Production clock modules have no test inputs.

- `clock.ts`: Immutable time baked into test main/worker bundles.
- `storage-client.ts`: Existing StorageClient with a test worker path.
- `entry.ts`: Profile/seed preflight, no protocol registration, blocked external calls and the real App.
- `build.mjs`: Explicit selector, importer-scoped aliases, source/build checks, actual expiry rejection and restart evidence.

Only `--fixed-at=<canonical UTC ISO>` selects this composition. Reports use `runs/fixed-*`; old real-date reports and skips remain untouched. Renderer/preload are unchanged; observedAt comes from Repository. Normal Electron quit/relaunch with the same profile verifies persistence; page reload is insufficient.

[PROTOCOL]: Update this header when making changes, then check README.md.

Each build owns a unique UUID bundle namespace. Failed builds, seed/server/app startup failures and close failures still clean only that namespace. Source drift and cleanup errors are recorded without replacing the original scenario failure.
