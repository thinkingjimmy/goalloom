# Desktop sync

INPUT: Account session, encrypted device vault, window/power events and scoped storage-worker commands.
OUTPUT: Encrypted synchronization, independent upload recovery and localized status. Task content stays outside logs.
POS: Main-process network coordinator. SQLite transactions remain in the storage worker.

- `service.ts`: Account/setup lifecycle, complete first upload, automatic first-join planning with protected atomic install, returning-device resume, keep-local sign-out without cipher access, explicit crash-safe task cleanup, pinned workspace discovery and non-destructive password recovery without an OS credential dependency, verified roster cache and settings projection.
- `recovery.ts`: Encrypted retry drafts and signed non-destructive cloud creation before atomic local installation.
- `network-monitor.ts`: Two-second OS connectivity transitions with scoped cleanup; no DNS probes.
- `schedule.ts`: Single executor, retained triggers, monotonic deadlines and adaptive checks.
- `exchange.ts`: Read-first bounded turns, awaited preference projection before reconciliation/uploads, receipt confirmation and upload cooldown.
- `cooldown.ts`: Account-scoped retry deadlines that survive restart.
- `pending-cache.ts`: Stable recovery-key-protected prepared payloads and preserved legacy OS journals; unknown secret operations keep their original hash.
- `project-settings.ts`: Device preference projection without echoing local writes; parent-order policy reaches main and its device file before renderer notification. A revision captured before the settings read and deferred secret writes lets newer local toggles invalidate stale projection/notifications.
- `vault.ts`: Serialized atomic account/device ciphertext, encrypted recovery drafts and public resume flag; sign-out preserves current/legacy ciphertext without decryption.
- `session-vault.ts`: Authoritative `sync-session.bin`, preserved legacy-vault migration and durable sign-out. A password-only recovery promotes after verification when secure storage is available.
- `session-cipher.ts`: Profile-bound AES-GCM with a macOS Data Protection Keychain key; Windows retains DPAPI. Startup restores keys/tokens silently; explicit sign-in requires a new password proof.
- `password-vault.ts`, `sealed-file.ts`: Account-bound password recovery, verified-cloud-key credential restoration and domain-separated authenticated local encryption. No native authorization UI.
- `oauth.ts`, `callback-page.ts`, `config.ts`: Explicit Apple/Google PKCE, shared callback/cancellation, local configuration and authentication boundary.
- `environment.ts`: Protected one-time production transition before network startup; separate session/password/send-journal directory, retained legacy ciphertext and an atomic transition receipt.
- `callback-copy.ts`: Five-language static browser-return copy. Development returns directly to its own window and does not register or open the production OS scheme.
- `host.ts`: Deterministic periods and import alignment using the applier’s target calendar.

Generation-bound task-review reads pass through `service.ts` to storage; the service publishes the pending local task count after acknowledgement. Review writes remain normal repository commands.

The product contract is [desktop sync](../../../../../docs/sync/desktop.md). Protocol rules are in [protocol v1](../../../../../docs/sync/protocol-v1.md). Synthetic E2E uses real SyncService, SDK and storage. Separate hosted SQL and `test:sync-security:live` acceptance verify real server guards and development Auth/HTTP/private-Realtime client journeys.

[PROTOCOL]: Update this header when making changes, then check README.md.

Account-only Apple/Google login uses `sign-in` with `purpose: ai`. Protected sessions retain that intent across restart and return phase `account`; they perform no cloud discovery, device registration, password setup or upload. `accountId()` and `accountSession()` expose identity and credentials only inside main. Explicit `prepare-sync` continues the existing sync flow and retains linked-workspace account guards. Renderer status contains only the account UUID, never tokens.
