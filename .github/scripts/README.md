# Release scripts

> Parent: [Development](../../docs/development.md). Manual release workflow helpers.

- `macos-signing.sh`: imports the existing Developer ID identity into a temporary CI keychain, verifies signed artifacts and cleans up release credentials.
- `macos-profile.mjs`: authenticates Apple requests, resolves and validates the private session provisioning profile, and exports its path without exposing its contents.
- `apple-profile.mjs`: matches the imported signing certificate, reuses its active macOS profile, or creates the fixed app profile only when explicitly enabled.
- `draft-release.sh`: stages exact-version update assets and checksums in a GitHub release draft; public release remains a separate action.

Profile CLI acceptance: `pnpm --filter @goalloom/desktop exec -- node tests/review/session-profile.mjs`. Synthetic boundaries do not establish signed package acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
