# Desktop sync

INPUT: Account session, encrypted device vault, window/power events and scoped storage-worker commands.
OUTPUT: Encrypted synchronization, independent upload recovery and localized status. Task content stays outside logs.
POS: Main-process network coordinator. SQLite transactions remain in the storage worker.

- `service.ts`: Account/setup lifecycle, complete first upload, automatic first-join planning with protected atomic install, returning-device resume, keep-local sign-out without cipher access, explicit crash-safe task cleanup, pinned workspace discovery and non-destructive password recovery without an OS credential dependency, verified roster cache and settings projection.
- `recovery.ts`: Encrypted retry drafts and signed non-destructive cloud creation before atomic local installation.
- `network-monitor.ts`: Two-second OS connectivity transitions with scoped cleanup; no DNS probes.
- `schedule.ts`: Single executor, retained triggers, monotonic deadlines and adaptive checks.
- `exchange.ts`: Read-first bounded turns, awaited preference projection before reconciliation/uploads, receipt confirmation and upload cooldown.
- `receipt-recovery.ts`: Exact original operation/hash receipt checks before normal service admission and during a service pause; no discovery, upload, pull, key change or cursor advance. Only an actual receipt query starts the receipt cooldown; an empty unknown queue cannot delay later recovery.
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

All ordinary sync requests send service compatibility version 2. Typed billing/upgrade denials pause cloud work and close Realtime while preserving account identity, keys, outbox, original receipt hashes and cursors. Current head hints use `cloud:v1:ws:<workspaceId>`. Billing refresh can confirm exact unknown receipts independently, and restored eligibility resumes an already configured engine with its existing upload cooldown.

D2 cloud traffic uses `cloudServiceHeaders` version 2; hosted AI explicitly keeps version 1. `binding-identity.ts` defines the complete main/worker binding guard. `binding-journal.ts` protects exact initialization-envelope bytes and retired key/send-file contexts before the SQL handoff. `seed-binding.ts` coordinates one exact-state seed and its original-final acknowledgement; remote initialization, local transition and internal seed IDs are independent. The worker fences post-final sends until its matched initialization acknowledgement is durable. `protected-records.ts` provides purpose-bound atomic protected files without a renderer read capability. `copies.ts` and `retrieval-worker.ts` build an independent baseline copy with no normal registration, settings delivery, reconcile or AI.

Scoped custody uses `key-scope.ts`: canonical account/project/environment selects a hash partition under the managed `sync/scopes/` tree. PasswordVault and BindingJournal have separate keys between scopes and authenticate the complete scope. Native custody may hold a key map; password and retained-context payloads explicitly contain only the selected scope's master/device/workspace/recovery state, with no other accounts or Auth tokens. A stable scope master does not provide cryptographic generation revocation.

Explicit passwords establish a recovery container even while OS custody is available. Automatic body updates verify the same recovery key/workspace and preserve its original lock; body authentication also binds the KDF/lock. New-generation password material is prepared and read-back verified under the original transition ID, then promoted only by its matching SQLite receipt. Restart resolves that same outcome. Existing unreadable scoped or unpublished global journal evidence prevents random-master replacement; formal v1 password files retain their verified recovery path and are filtered into scoped state. Original files remain unchanged.

Protected operations capture their scope/path/key before asynchronous IO. Session cancellation fences post-await runtime promotion; explicit clear cancels/drains scoped writers and removes the managed tree while preserving the independent privacy receipt. Key-custody files never enter workspace exports, SQLite backups or uploads.

`epoch-custody.ts` resolves a prepared same-binding key epoch through the original immutable SQLite receipt before durable password/native/journal and runtime promotion. `BindingJournal` retains the scoped preparation and digests; ordinary exchange captures the advanced complete guard only after verification. Bootstrap and original initialization receipts stay unchanged. Missing original preparation fails closed.
