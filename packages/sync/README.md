# Shared synchronization

INPUT: Validated encrypted operations, authenticated remote, device keys and an injected SQL driver.
OUTPUT: Verified workspace binding, continuous replay, durable send states and bounded cancellable RPCs.
POS: Shared desktop/mobile protocol engine. It has no Electron or server-source dependency.

`remote.ts` defines the network port. `fetch-remote.ts` and `request.ts` own HTTP validation, deadlines and cancellation. `session.ts` owns binding and operation exchange. `board.ts`, `codec.ts`, `push.ts` and `receipts.ts` preserve projection, encryption, batching and receipts. `memory-remote.ts` supplies a synthetic cloud for acceptance.

Desktop scheduling lives in `apps/desktop/src/main/sync/`. See [protocol v1](../../docs/sync/protocol-v1.md) for operation invariants.

[PROTOCOL]: Update this header when making changes, then check README.md.
