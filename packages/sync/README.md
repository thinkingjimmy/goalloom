# Shared synchronization

INPUT: Validated encrypted operations, authenticated remote, device keys and an injected SQL driver.
OUTPUT: Verified workspace binding, continuous replay, durable send states and bounded cancellable RPCs.
POS: Shared desktop/mobile protocol engine. It has no Electron or server-source dependency.

`remote.ts` defines the network port. `fetch-remote.ts` and `request.ts` own HTTP validation, deadlines and cancellation. `session.ts` owns binding, non-destructive recovery proofs and operation exchange. Returning clients use explicit workspace discovery; recovery creates a fresh cloud generation and reuses signed identities on retry. `join.ts` plans first connections and atomically preserves identities, deletion history and returning-device cursors; `board.ts` supplies transaction-owned baseline preparation. `seed.ts` supplies exact new-cloud initialization and atomic old-binding retirement. `first-connection.ts` preserves the source outbox and fills implicit policies/offline placements before first upload, checking the resulting task projection. `board.ts`, `codec.ts`, `push.ts` and `receipts.ts` preserve projection, encryption, batching and receipts. `memory-remote.ts` supplies multiple isolated synthetic workspaces for acceptance.

Desktop scheduling lives in `apps/desktop/src/main/sync/`. See [protocol v1](../../docs/sync/protocol-v1.md) for operation invariants.

Baseline nesting actions follow sibling sort order, so every preceding sibling is already nested when its successor uses it as an insertion anchor. Database row order is not a placement order.

`seed.ts` verifies an original initialization handoff after key rotation through `assertBindingEpochLineage`: every committed epoch receipt must connect the complete original identity to the current identity. It never ignores epoch differences or rewrites the original final ID/hash/sequence. Main owns authenticated roster/envelope verification and protected preparation/promotion around the core CAS; no key enters the receipt table.

[PROTOCOL]: Update this header when making changes, then check README.md.

Sync service admission uses `x-goalloom-service-version: 2` (hosted AI keeps its independent version 1), independently of encryption protocol 1. `fetch-remote.ts` classifies finite billing/upgrade errors before legacy authentication errors. `receiptsFor` requires original operation IDs and payload hashes together; it exposes only exact confirmations. Service refusal never authorizes key/device setup or local data removal. The desktop's separate receipt recovery runs before ordinary status admission.

`seed.ts` captures validated exact rows, packs at most 200 records and 1,048,536 complete plaintext bytes per operation, and enforces a 104,857,600 canonical-row-byte source limit. `commitBindingTransition` preserves local generation/commands/events/undo receipts and retires the original operational rows in the same transaction as the new seed queue and active binding. A null old binding is accepted only for an explicitly guarded unbound source without canonical/unknown-send identity. The old protected reference is then null; the new protected draft reference is always required.

Local transition requestId, remote initializationRequestId and encrypted seedId are independent. The active singleton identifies the local transition receipt. `readSeedHandoff` distinguishes computed final sequence from verified original canonical receipt; the host alone performs the lifecycle `FinishInitialization`, protects its acknowledgement and releases post-final uploads. `assertSeedBoundary` and isolated replay are exported by store-core for retained-copy verification. Preferences use the existing consent path after final, and seed operations never manufacture local history.

D2: `cloud-remote.ts` owns strict lifecycle/privacy/retrieval HTTP, actual-byte response caps and the independent no-Auth deletion receipt. `retrieval.ts` validates the frozen proof/control chain and complete fixed head before producing a ready copy; original hashes are checked before secret redaction. `seed.ts` exports exact baseline capture/encoding and the atomic retired-binding transition. Sync admission is now 2 (`cloudServiceHeaders`), while hosted AI retains its separate version 1. Crypto/log and JSON DTO versions remain 1.

Retrieval failures after `fetch` starts may carry finite `requestDiagnostic` metadata: fixed method/path, observed HTTP status and a known error code. Pre-dispatch failures carry no request metadata. Attachment is best effort and always preserves the original error; bodies, headers and tokens are excluded.

`joinPlan` accepts the host period materializer as its fourth argument. Complete zero-item seed history is classified through the existing shared applier inside a fully rolled-back savepoint; malformed/incomplete seeds, tombstones and later task operations never make that history pristine. The same proof preserves first-import source calendar and operation identities. A caller without the host conservatively treats seeded history as requiring a choice. `readSeedHandoff` returns null for a completed joined seed without a local transition; a loading seed still requires its exact local receipt.
