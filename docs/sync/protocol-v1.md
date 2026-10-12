# Goalloom sync protocol v1

`protocolVersion = 1`, SyncOp `formatVersion = 1`. This file is the executable spec for Phase 0. The product narrative stays in [goalloom-mobile-prd.md](../mobile/goalloom-mobile-prd.md). Each rule names the test that locks it.

## Canonical JSON

`canonicalJson` in `packages/contracts/src/canonical.ts` is the only encoding for `payloadHash`, roster bodies and recovery checkpoints.

- Object keys are sorted by UTF-16 code unit.
- `undefined` object fields are dropped. Arrays keep their order and do not drop holes.
- No insignificant whitespace. Strings are `JSON.stringify` strings.
- Test: `tests/sync/adversarial.test.ts` “canonical JSON”.

`payloadHash` is SHA-256 hex of the canonical SyncOp (`packages/crypto` `sha256Hex`).

## SyncOp

Zod schema: `packages/contracts/src/sync-op.ts`. A payload that fails the schema is not applied.

```ts
{ v: 1, opId: uuid, deviceId: string, at: iso, actions: Action[] }
```

`at` is display and injection time. It is not a sort key. Server order is `seq`.

Actions (one user command is one atomic op):

| Action | Meaning |
| --- | --- |
| `item.create` | Insert one item and its placement. `id` is the local id. Optional `parentId` does not itself insert an edge when a `rel.link` for the same pair is present. |
| `item.set` | Field diff: `title`, `description`, `dueDate`, `flowColor`. Only changed keys are present. |
| `item.status` | `todo` / `done` / `cancelled` plus the matching timestamps. |
| `item.place` | Horizon, period key and sort hint. `reason` is `move`, `arrange` or `rollover`. |
| `item.archive` | `archivedAt` set or cleared. |
| `item.delete` / `item.restore` | Soft delete. Restore requires `expectedDeleteOpId`. |
| `item.discardIfEmpty` | Delete only when the domain empty-card predicate matches `expectVersion`. |
| `item.rollover` | System op. Deterministic UUIDv5. See rollover below. |
| `rel.link` / `rel.unlink` | Edge id is allocated on the writer and copied into the action. |
| `guidance.set` | Note body plus `baseRevision`. |
| `policy.set` | One horizon, `auto` or `manual`, effective from a period key. |
| `calendar.setup` | The confirmed calendar. Later calendar edits are not a sync action. |
| `revert` | `targetOpId` plus `all_or_nothing` or `per_dimension`. |

## Command map

Local commands run first. The SyncOp is the diff plus the intent, written in the same `BEGIN IMMEDIATE` transaction (`src/main/workspace/sync/emit.ts`).

| Command | SyncOp | Test |
| --- | --- | --- |
| `confirmSetup` | `calendar.setup` | `tests/integration/sync-emit.test.ts` (setup row exists before other actions) |
| `create` / `createPlan` | one SyncOp: `item.create` and, when a parent edge was inserted, `rel.link` | sync-emit create; `tests/integration/sync-emit-commands.test.ts` |
| `edit` | `item.set` with only the changed fields | sync-emit “field diff” |
| `flowColor` | `item.set` flowColor | sync-emit “maps move, colour…” |
| `move` | `item.place` reason `move` | sync-emit move |
| `arrangeBacklog` / `materializeParentOrder` | `item.place` reason `arrange` | sync-emit-commands |
| `link` / `unlink` | `rel.link` / `rel.unlink` | sync-emit |
| `status` / `archive` | `item.status` / `item.archive` | sync-emit |
| `delete` / `restoreItem` | `item.delete` / `item.restore` | sync-emit |
| `discardEmpty` | `item.discardIfEmpty` | sync-emit-commands |
| `policy` | `policy.set` | sync-emit |
| `applyAssistance` | `guidance.set` | sync-emit-commands |
| `undo` of `never_sent` | no new op; that row becomes `reverted_local` | sync-emit undo; cases 10 and 20 |
| `undo` of `send_unknown` or `accepted` | new `revert` op, `all_or_nothing` | cases 10 and 20 |
| `undoBatch` of a system rollover | each undone `item.rollover`: `never_sent` becomes `reverted_local`; `send_unknown`, `accepted` or `applied` gets its own `revert` op. Skipped effects are left alone | sync-emit-commands |
| `preferences`, `backupPreferences`, `confirmClock`, `confirmRollover` | none | sync-emit; confirmRollover in sync-emit-commands |
| reconcile rollover | one local `operations` receipt, plus one `item.rollover` per moved item whose `base_item_placements` period still matches the source | cases 13 and 14 |

## Send states

`never_sent → send_unknown → accepted → applied`, plus `reverted_local` and `quarantined`.

- `send_unknown` is written before the request leaves the device.
- The sticky trigger `sync_ops_send_state_irreversible` rejects any update to `never_sent` or `reverted_local` once the row has left `never_sent`. `never_sent → reverted_local` is allowed.
- `outcome` is written only when the op is applied at its canonical `seq`.
- Tests: `tests/integration/upgrade-v9.test.ts` (trigger), `tests/sync/phase0.test.ts` cases 2, 3, 10, 20.

## Baseline

Confirmed state lives in `base_*`, cloned from the seven business tables (constraints included). Visible rows are `base_*` plus pending ops (`never_sent`, `send_unknown`, and `accepted` with `seq > lastAppliedSeq`).

`mergeRemoteOps` requires `seq = lastAppliedSeq + 1`. Each op runs in a `SAVEPOINT`. Business errors record `rejected` and a `sync_conflicts` row; the cursor still advances. Storage errors abort the transaction and leave the cursor unchanged (case 3).

`rebuildVisibleFull` preserves device-local workspace columns, copies `base_*` back, then replays pending ops. `operations` rows are not deleted. Visible `workspace.revision` becomes the greater of the visible counter and `base_workspace.revision`, so a local command does not roll the renderer guard backward. Tests: cases 9, 11, 12, 19 and `tests/sync/applier-review.test.ts`.

`canon_ops` / `canon_changes` are appended only at the canonical seq. `dim` is one of `create`, `delete`, `restore`, `title`, `description`, `dueDate`, `flowColor`, `status`, `archive`, `placement`, `relation`, `guidance`, `policy`, `calendar`. A revert walks that op's canon rows from the last index backward and writes the inverted value under the original `dim`.

The reference applier (`packages/store-core/src/apply.ts`) additionally:

- `rel.link` rejects Later and any parent that is not in a strictly longer horizon (`horizon_order`). Cycles stay on the SQLite trigger (`relation_cycle`).
- A colored child requires `adoptParentFlow`. The color is cleared on the child and copied to the parent only when that parent is uncolored and has no active edge.
- `item.place` into Later records a relation change for each parent edge it invalidates. A `rel.unlink` for an edge this same op already invalidated does not record a second change.
- `item.restore` revives edges with `reason='delete'` and `invalidatedBy` equal to `expectedDeleteOpId`, skipping a deleted other endpoint, a flow-root child, a duplicate, or a cycle. A flow color taken by a live item stays with that item.
- Placement revert writes `sortKey`. A relation whose `before` is null is invalidated; a relation whose `before` is the edge is made active again.

Tests: `tests/sync/applier-review.test.ts`. Case 11 places the parent on year and the child on month.

## Error codes

Business (one op rolls back, cursor advances): `packages/contracts/src/errors.ts` `businessErrorCodes`. Case 14 expects `rollover_stale`.

Pause the workspace and stop applying: `key_missing`, `unsupported_version`, `auth`, `generation`, `storage`, `blob_missing`. Case 8.

Push results, per op: `op_id_reused`, `stale_epoch`, `rate_limited`, `payload_too_large`, `protocol_too_old`. Cases 1 and the SQL stale-epoch check.

## Rollover identity

`opId = UUIDv5("rollover:<itemId>:<fromHorizon>:<fromStart>@<placementSeq>:<toHorizon>:<toStart>", workspaceId or generation)`.

Two devices that observe the same canonical placement emit the same hash (case 13). A rollover whose `placementSeq` or period does not match the base placement is `rollover_stale` (case 14). Pending placement edits do not emit a rollover.

## Snapshots and compaction

P0 snapshot body is canonical JSON of `base_*` plus canon rows at `uptoSeq` (`packages/store-core/src/snapshot.ts`). It is not zstd. Encryption is C4. Installing a snapshot keeps the snapshot generation (case 7) and does not call `replaceDataset`.

Server compaction may delete `ops` rows and must keep `op_receipts`. A retry with the same hash returns the original `seq` and does not allocate another one (case 1, `supabase/tests/0001_core.test.sql`). A different hash is `op_id_reused`.

Push batches are at most 200 ops and 1 MiB. An op with a missing blob holds every later op (case 18).

## Keys

Constructions live in `packages/crypto`. Vectors: `packages/crypto/test/vectors.json`.

| Construction | Domain | Test |
| --- | --- | --- |
| C1 wrap | `goalloom/wrap/v1` | `tests/crypto/constructs.test.ts`, case 5 |
| C2 roster | `goalloom/roster/v1` | constructs roster chain, cases 6 and 15 |
| C3 op | `goalloom/op/v1` | constructs AAD |
| C4 snapshot / blob | `goalloom/snap/v1`, `goalloom/blob/v1`, 64 KiB chunks | constructs AAD |
| Recovery KDF | `goalloom/recovery/v1\|<workspaceId>` | constructs, case 21 |
| Checkpoint | `goalloom/recovery-cp/v1` | case 21 |

Unwrap verifies the signature with a caller-supplied trusted public key before decrypting. `rosterWrapTargets` is the roster device ids plus `recovery`. A public key that exists only on the server is not a wrap target (case 6).

A recovery join checks the phrase-derived public key, the checkpoint signature, the roster hash pinned by that checkpoint, and a device signature over the same checkpoint bytes. A copied recovery public key fails (cases 15 and 21). `acceptNewerCheckpoint` rejects a lower `cpVersion` and a `prevCpHash` that does not extend the pinned checkpoint.

Server RPCs are in `supabase/migrations/0001_core.sql`. `_ed25519_verify` calls `pgsodium.crypto_sign_verify_detached` on the message bytes noble's `ed25519.sign` / `ed25519.verify` hash internally. Roster signatures are the 32-byte SHA-256 of `goalloom/roster/v1|` plus canonical JSON (`_roster_message`). `bootstrap_workspace`, `commit_roster`, `rotate_epoch`, and `complete_recovery` all verify that digest. `commit_roster` and `rotate_epoch` require the calling device's authorized signing key. `complete_recovery`, and a `commit_roster` whose signer type is `recovery`, require `recoverySignPub` from the current roster. A mismatch raises `roster_signature_rejected` (`42501`). A missing pgsodium function raises `42501`. On hosted Supabase that verify function is granted; `crypto_sign_new_keypair` is not. The pgTAP file checks noble fixtures from `scripts/gen-ed25519-fixtures.mjs`. Commands are in `supabase/README.md`.

`public.sync_entitled(uuid)` is the only billing hook. `push_ops` and `pull_ops` call it with `auth.uid()` and reject with `42501` when it is false. The shipped body returns true because `public.entitlements` does not exist yet. When that table exists, the function reads `active` for the Supabase user id and treats a missing row as not entitled. Paid sync is RevenueCat later (web billing first); there is no payment code.

## Test index

| # | Where |
| --- | --- |
| 1 | `applyPushReceipts` and `supabase/tests/0001_core.test.sql` |
| 2, 3, 10, 20 | `tests/sync/phase0.test.ts` |
| 4, 16, 17 | `supabase/tests/0001_core.test.sql`; Realtime resubscribe and Storage URLs in `scripts/supabase-remote.mjs` |
| 5, 6, 7, 8, 15, 21 | `tests/sync/adversarial.test.ts` |
| 9, 11, 12, 13, 14, 18, 19 | `tests/sync/phase0.test.ts` |
| C1–C4 vectors | `tests/crypto/constructs.test.ts` |

## Deviations from the PRD

- Desktop sources stay in `src/`. Shared code is `packages/{contracts,crypto,schema,store-core,sync}`. Moving the app to `apps/desktop` is still P1.1.
- `item_guidance.operationId` keeps its column name. The foreign key to `operations` is gone; the value is the source operation id.
- The persisted initial send state is `never_sent`. The older word `pending` is not stored.
- `item.discardIfEmpty` cannot observe a stored empty title. The items CHECK requires a trimmed title of 1–500 characters. The predicate matches the domain empty-card rule.
- P0 snapshots are canonical JSON inside C4. zstd is not applied.
- `Store.summaries` still uses SQLite functions. `item_signals` is P1.2.
- `_ed25519_verify` uses pgsodium verify. Hosted postgres cannot call `crypto_sign_new_keypair`. Tests use noble fixtures. `supabase/README.md` has the push, pgTAP, reset and Node commands. There is no local Docker database and no sha256 oracle.
- Realtime broadcasts are written to `control_events`. A `realtime.send` failure does not roll back an accepted push.
- `snapshot-url` signs a Storage URL only after `snapshot_access` accepts the caller. It refuses when its runtime secrets are missing and does not embed a service key.
- `apps/mobile` is the Hermes runner. It was not executed here (no iOS simulator). P0.6b, P0.6c and P0.7 stay open.
- Reconcile still writes one local `operations` receipt, and also one deterministic `item.rollover` SyncOp per moved item.
- A dataset replace clears sync projection tables, pauses with `generation`, and copies the new projection into `base_*`. Exports do not include the sync tables.
