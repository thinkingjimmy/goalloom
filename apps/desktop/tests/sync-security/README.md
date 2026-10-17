# Sync security acceptance

INPUT: Current desktop build, isolated test profiles, controlled boundaries or explicitly authorized development Supabase API keys.
OUTPUT: Repeatable service/SQLite and native-window reports under `output/tests/sync-security/`.
POS: Feature acceptance fixtures. Product rules remain in [desktop sync](../../../../docs/sync/desktop.md).

- `cases.ts`: Production service/SDK/storage failure and lifecycle journeys, including workspace discovery, retries, cleanup and reconnection.
- `password-cases.ts`: Denied-Keychain Case 1, fresh Google authorization, password/cloud-key recovery, stable devices, pending sends, interrupted creation, failed file writes, account guards and complete cleanup. Select with `node tests/sync-security.mjs password`.
- `resume-cases.ts`: Persistent Case 1, restart/upgrade migration, Google/password-gated relogin, retained task/device IDs and tombstones, offline recovery, unknown sends, durable logout failures and late token-save races. Select with `node tests/sync-security.mjs resume`.
- `native-entry.ts`: Test-only multi-account composition around the production application. It never loads real credentials or changes Wi-Fi.
- `live.ts`: Production service/SDK/SQLite journeys against real development Auth, HTTP/RPC and private Realtime. Only disposable accounts are used.
- `../sync-security.mjs`: Service/SQLite runner.
- `../sync-security-native.mjs`: Native renderer/IPC runner; `--packaged` selects an isolated ad-hoc macOS ASAR app and records its hash/artifact.

Run `pnpm build` first. Root commands are `pnpm test:sync-security` and `pnpm test:sync-security:packaged`. Hosted SQL is separate: `node scripts/sync-security-hosted.mjs`. Synthetic OAuth/HTTP, instrumented packages, Developer ID installers and Windows are distinct acceptance scopes.

Before implementing live acceptance, cover these failure cases: recovery deletes an older workspace or changes an existing device's pin; a lost creation response produces duplicate spaces after restart; a foreign account receives or uploads a kept board; clear leaves old tasks in the next account; offline startup does not refresh a real session or upload pending edits after connectivity returns; real private Realtime fails to subscribe or deliver a head change. Cleanup must remove only accounts and rows created by the current run, also on failure. API keys, passwords, tokens and task bodies must never enter logs or reports.

`pnpm test:sync-security:live` runs the live journeys and writes `output/tests/sync-security/live/report.json`. It reads authorized API keys from memory/environment or the scoped management API. If that token lacks key-read permission, `--browser-keys` provides a one-use loopback password form for an already authorized dashboard session. It never creates keys or changes permissions. The test uses real password-auth sessions for disposable users; it does not establish Google provider UI, production keychain, OS Wi-Fi or installer acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
