# Release scripts

> Parent: [Development](../../docs/development.md). Manual release workflow helpers.

- `macos-signing.sh`: imports the existing Developer ID identity into a temporary CI keychain, checks noninteractive signing access, verifies signed artifacts through the shared bounded ticket validator and cleans up release credentials. The preflight job checks these credentials/profile before either platform starts source tests.
- `macos-profile.mjs`: authenticates Apple requests, resolves and validates the private session provisioning profile, and exports its path without exposing its contents.
- `apple-profile.mjs`: matches the imported signing certificate, reuses its active macOS profile, or creates the fixed app profile only when explicitly enabled.
- `draft-release.sh`: stages exact-version update assets and checksums in a GitHub release draft; public release remains a separate action.
- `macos-display.swift`: selects a supported native CI desktop mode, persists it only for the login session and records dimension evidence before native acceptance.

Display preparation failure cases: accidentally changing an owner's desktop; no supported mode large enough for the native fixtures; pixel dimensions mistaken for logical desktop bounds; a rejected or incomplete display transaction; and a mode reverting when the helper exits. CI display preparation must be GitHub-Actions-only, select an existing desktop mode, commit for the login session, record before/available/after dimensions and fail before acceptance when the required bounds are unavailable. It must not change app behavior, emulate a browser viewport or retry focus.

Release workflow graph acceptance: `pnpm --filter @goalloom/desktop exec -- node tests/review/release-workflow.mjs`. `preflight_only` skips tests, packages and draft changes; cleanup and a public status summary run after success or failure. Profile creation is explicit and occurs only in preflight; packaging is read-only. A creation 403 must not trigger another full build.

Profile CLI acceptance: `pnpm --filter @goalloom/desktop exec -- node tests/review/session-profile.mjs`. Synthetic boundaries do not establish signed package acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
