# Desktop sync

INPUT: Account session, encrypted device vault, window/power events and scoped storage-worker commands.
OUTPUT: Encrypted synchronization, independent upload recovery and localized status. Task content stays outside logs.
POS: Main-process network coordinator. SQLite transactions remain in the storage worker.

- `service.ts`: Account/setup lifecycle, complete first upload, automatic first-join planning with protected atomic install, returning-device resume, keep-local sign-out without cipher access, explicit crash-safe task cleanup, pinned workspace discovery and non-destructive recovery or a network dependency, verified roster cache and settings projection.
- `recovery.ts`: Encrypted retry drafts and signed non-destructive cloud creation before atomic local installation.
- `network-monitor.ts`: Two-second OS connectivity transitions with scoped cleanup; no DNS probes.
- `schedule.ts`: Single executor, retained triggers, monotonic deadlines and adaptive checks.
- `exchange.ts`: Read-first bounded turns, receipt confirmation and upload cooldown.
- `cooldown.ts`: Account-scoped retry deadlines that survive restart.
- `pending-cache.ts`: OS-protected prepared payloads; unknown secret operations keep their original hash.
- `project-settings.ts`: Device preference projection without echoing local writes.
- `vault.ts`: Serialized atomic account/device ciphertext, encrypted recovery drafts and public resume flag; sign-out preserves current/legacy ciphertext without decryption.
- `oauth.ts`, `callback-page.ts`, `config.ts`: OAuth callback, local configuration and authentication boundary.
- `host.ts`: Deterministic periods and import alignment using the applier’s target calendar.

The product contract is [desktop sync](../../../../../docs/sync/desktop.md). Protocol rules are in [protocol v1](../../../../../docs/sync/protocol-v1.md). Synthetic E2E uses real SyncService, SDK and storage. Separate hosted SQL and `test:sync-security:live` acceptance verify real server guards and development Auth/HTTP/private-Realtime client journeys.

[PROTOCOL]: Update this header when making changes, then check README.md.
