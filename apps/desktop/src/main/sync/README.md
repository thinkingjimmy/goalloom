# Desktop sync

INPUT: Account session, encrypted device vault, window/power events and scoped storage-worker commands.
OUTPUT: Encrypted synchronization, independent upload recovery and localized status. Task content stays outside logs.
POS: Main-process network coordinator. SQLite transactions remain in the storage worker.

- `service.ts`: Account/setup lifecycle, verified roster cache and settings projection.
- `schedule.ts`: Single executor, retained triggers, monotonic deadlines and adaptive checks.
- `exchange.ts`: Read-first bounded turns, receipt confirmation and upload cooldown.
- `cooldown.ts`: Account-scoped retry deadlines that survive restart.
- `pending-cache.ts`: OS-protected prepared payloads; unknown secret operations keep their original hash.
- `project-settings.ts`: Device preference projection without echoing local writes.
- `vault.ts`: Atomic encrypted account/device secrets and public resume flag.
- `oauth.ts`, `callback-page.ts`, `config.ts`: OAuth callback, local configuration and authentication boundary.
- `host.ts`: Deterministic workspace projection for the shared operation applier.

The product contract is [desktop sync](../../../../../docs/sync/desktop.md). Protocol rules are in [protocol v1](../../../../../docs/sync/protocol-v1.md). Synthetic E2E uses real SyncService, SDK and storage; hosted SQL acceptance is separate.

[PROTOCOL]: Update this header when making changes, then check README.md.
