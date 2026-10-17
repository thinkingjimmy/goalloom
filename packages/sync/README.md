# Shared synchronization

INPUT: Validated encrypted operations, authenticated remote, device keys and an injected SQL driver.
OUTPUT: Verified workspace binding, continuous replay, durable send states and bounded cancellable RPCs.
POS: Shared desktop/mobile protocol engine. It has no Electron or server-source dependency.

`remote.ts` defines the network port. `fetch-remote.ts` and `request.ts` own HTTP validation, deadlines and cancellation. `session.ts` owns binding, non-destructive recovery proofs and operation exchange. Returning clients use explicit workspace discovery; recovery creates a fresh cloud generation and reuses signed identities on retry. `join.ts` plans first connections and atomically preserves identities, deletion history and returning-device cursors; `board.ts` supplies transaction-owned baseline preparation. `first-connection.ts` preserves the source outbox and fills implicit policies/offline placements before first upload, checking the resulting task projection. `board.ts`, `codec.ts`, `push.ts` and `receipts.ts` preserve projection, encryption, batching and receipts. `memory-remote.ts` supplies multiple isolated synthetic workspaces for acceptance.

Desktop scheduling lives in `apps/desktop/src/main/sync/`. See [protocol v1](../../docs/sync/protocol-v1.md) for operation invariants.

[PROTOCOL]: Update this header when making changes, then check README.md.
