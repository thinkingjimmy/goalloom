# Goalloom sync protocol v1

`protocolVersion = 1`, SyncOp `formatVersion = 1`. This file is the executable spec for Phase 0. The product narrative stays in [goalloom-mobile-prd.md](../mobile/goalloom-mobile-prd.md). Each rule names the test that locks it.

## Canonical JSON

`canonicalJson` in `packages/contracts/src/canonical.ts` is the only encoding for `payloadHash`, roster bodies and recovery checkpoints.

- Object keys are sorted by UTF-16 code unit.
- `undefined` object fields are dropped. Arrays keep their order and do not drop holes.
- No insignificant whitespace. Strings are `JSON.stringify` strings.
- Test: `packages/tests/sync/adversarial.test.ts` “canonical JSON”.

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
| `item.place` | Horizon, period key and sort hint. `reason` is `move`, `arrange` or `rollover`. Sort is among items with the same nesting parent. The parent id itself is not changed. |
| `item.nest` | Set or clear `nestingParentId` and the resulting horizon, period and sort. `parentId` null makes the task independent. |
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

Local commands run first. The SyncOp is the diff plus the intent, written in the same `BEGIN IMMEDIATE` transaction (`apps/desktop/src/main/workspace/sync/emit.ts`).

| Command | SyncOp | Test |
| --- | --- | --- |
| `confirmSetup` | `calendar.setup` | `apps/desktop/tests/integration/sync-emit.test.ts` (setup row exists before other actions) |
| `create` / `createPlan` | one SyncOp: `item.create` and, when a parent edge was inserted, `rel.link` | sync-emit create; `apps/desktop/tests/integration/sync-emit-commands.test.ts` |
| `edit` | `item.set` with only the changed fields | sync-emit “field diff” |
| `flowColor` | `item.set` flowColor | sync-emit “maps move, colour…” |
| `move` | `item.place` reason `move`. A child leaving its group is `item.nest` (parent cleared) plus `rel.link` for each materialized goal edge, then `item.place`. Live children that follow a root are extra `item.place` actions in the same op and keep their parent | sync-emit move; sync-emit nesting |
| `arrangeBacklog` / `materializeParentOrder` | `item.place` reason `arrange`. Followers of a moved root are included | sync-emit-commands |
| `nest` / `unnest` | `item.nest`. Nesting also emits `rel.unlink` for the child's own incoming goal edges and `item.set` when a flow color is cleared, before the parent is set. Unnest emits `item.nest` with `parentId` null, then `rel.link` for each materialized inherited edge | sync-emit nesting |
| `link` / `unlink` | `rel.link` / `rel.unlink` | sync-emit |
| `status` / `archive` | `item.status` / `item.archive` | sync-emit |
| `delete` / `restoreItem` | `item.delete` / `item.restore`. Delete unnests live children and a nested target first (`item.nest` plus materialized `rel.link`). Restore emits `item.nest` only for outline members the desktop command actually reattached | sync-emit |
| `discardEmpty` | `item.discardIfEmpty` | sync-emit-commands |
| `policy` | `policy.set` | sync-emit |
| `applyAssistance` | `guidance.set` | sync-emit-commands |
| `undo` of `never_sent` | no new op; that row becomes `reverted_local` | sync-emit undo; cases 10 and 20 |
| `undo` of `send_unknown` or `accepted` | new `revert` op, `all_or_nothing` | cases 10 and 20 |
| `undoBatch` of a system rollover | each undone `item.rollover`: `never_sent` becomes `reverted_local`; `send_unknown`, `accepted` or `applied` gets its own `revert` op. Skipped effects are left alone | sync-emit-commands |
| `preferences`, `backupPreferences` | `pref.set`, one action per changed key. Last writer wins per key (`at`, then `opId`) | sync-emit; `packages/tests/sync/settings-sync.test.ts` |
| `confirmClock`, `confirmRollover` | none | sync-emit; confirmRollover in sync-emit-commands |
| reconcile rollover | one local `operations` receipt, plus one `item.rollover` per moved root and per grouped child whose `base_item_placements` period still matches the source | cases 13 and 14 |

## Settings

User-facing preferences and API keys ride the same op log. There is no separate switch: once sync is on, a change emits `pref.set`. The value is sealed with the workspace key before upload. The server stores ciphertext.

`sync_settings` is an additive side table (`CREATE TABLE IF NOT EXISTS`). It does not change the v8 business DDL or `user_version`. A replay writes the row when the incoming `at` is newer, then the same `at` with a greater `opId`. The same `opId` does not write again. Workspace columns (`theme`, `style`, `checkStyle`, backup) are projected onto the visible workspace after replay. Language, renderer preferences and API keys are applied live by the desktop: language updates the device preference file, renderer keys update the open window, and an API key is read from the writer's keychain, sealed inside the op, then written into the other computer's keychain. The workspace database stores a sha256 fingerprint of the key, not the key. Backups drop secret rows and secret actions, then VACUUM, so the backup file does not contain the key.

Week start, timezone, calendar mode and the cycle anchor stay on `calendar.setup`. Rollover policy stays on `policy.set`.

These stay on the device: window size and position, the sync refresh token and session tokens, device id, the sync password and every key derived from it, clock anomaly, restore pause, workspace generation, review drafts and summary cache, dismissed notices, insight reviewed / dismissed / onboarded marks, and the link preview cache.

## Send states

`never_sent → send_unknown → accepted → applied`, plus `reverted_local` and `quarantined`.

- `send_unknown` is written before the request leaves the device.
- The sticky trigger `sync_ops_send_state_irreversible` rejects any update to `never_sent` or `reverted_local` once the row has left `never_sent`. `never_sent → reverted_local` is allowed.
- `outcome` is written only when the op is applied at its canonical `seq`.
- Tests: `apps/desktop/tests/integration/upgrade-v9.test.ts` (trigger), `packages/tests/sync/phase0.test.ts` cases 2, 3, 10, 20.

## Baseline

Confirmed state lives in `base_*`, cloned from the seven business tables (constraints included). Visible rows are `base_*` plus pending ops (`never_sent`, `send_unknown`, and `accepted` with `seq > lastAppliedSeq`).

A first-device baseline writes `calendar.setup` (with `confirmedAt` when the board was already confirmed) and each `policy.set` as their own ops, then the remaining actions in chunks of 200. Snapshot `rel.link` actions set `retain: true`. Replay of those baseline op ids does not swallow business errors: the baseline transaction rolls back and sync pauses. A launch with an empty `setupConfirmedAt` and a rejected local op whose first action is `calendar.setup` rebuilds the board from that op's stored payload. That repair deletes the `sync_conflicts` rows for the baseline and for `item.rollover` rejections that sit before the next applied op. A board that is already confirmed drops those same rows once, while the baseline conflict is still present.

`mergeRemoteOps` requires `seq = lastAppliedSeq + 1`. Each op runs in a `SAVEPOINT`. Business errors record `rejected` and a `sync_conflicts` row; the cursor still advances. Storage errors abort the transaction and leave the cursor unchanged (case 3).

`rebuildVisibleFull` preserves device-local workspace columns, copies `base_*` back, then replays pending ops. `operations` rows are not deleted. Visible `workspace.revision` becomes the greater of the visible counter and `base_workspace.revision`, so a local command does not roll the renderer guard backward. Tests: cases 9, 11, 12, 19 and `packages/tests/sync/applier-review.test.ts`.

`canon_ops` / `canon_changes` are appended only at the canonical seq. `dim` is one of `create`, `delete`, `restore`, `title`, `description`, `dueDate`, `flowColor`, `status`, `archive`, `placement`, `relation`, `guidance`, `policy`, `calendar`. A revert walks that op's canon rows from the last index backward and writes the inverted value under the original `dim`. Outline membership is the `placement` dimension: `before` / `after` include `nestingParentId` when the writer recorded it. A placement row written before nesting leaves that field untouched.

The reference applier (`packages/store-core/src/apply.ts`) additionally:

- `rel.link` rejects Later and any parent that is not in a strictly longer horizon (`horizon_order`). `retain: true`, or a `calendar.setup` in the same op, keeps an edge that a move, undo, restore or import already kept. Cycles stay on the SQLite trigger (`relation_cycle`).
- `calendar.setup` may include `confirmedAt`. When it is absent, the op's `at` is stored as the confirmation time.
- A colored child requires `adoptParentFlow`. The color is cleared on the child and copied to the parent only when that parent is uncolored and has no active edge.
- `item.place` into Later records a relation change for each parent edge it invalidates. A `rel.unlink` for an edge this same op already invalidated does not record a second change. Sort is scoped to the current nesting parent, which `item.place` does not change.
- `item.nest` requires the same horizon and period as the parent, a root parent, and a child with no live children, flow color or incoming goal edge. Two-level and same-period failures are `outline_conflict`. The SQL triggers remain the cycle and color backstop.
- `item.restore` revives edges with `reason='delete'` and `invalidatedBy` equal to `expectedDeleteOpId`, skipping a deleted other endpoint, a flow-root child, a duplicate, or a cycle. A flow color taken by a live item stays with that item.
- `item.delete` records a relation change for each edge it invalidates, before the delete change. Revert restores those edges after the item is live again. A trigger failure rejects the whole revert.
- Revert of `item.create` is `revert_superseded` when an active relation still touches the item. A link in the same op is inverted first, so that edge does not block the revert.
- `guidance` revert writes the previous value and increments `item_guidance.revision`.
- `item.set` of a non-null `flowColor`, and `item.create` into Later with a flow color, are `horizon_order`. Clearing a color is allowed.
- Placement revert writes `sortKey`. A relation whose `before` is null is invalidated; a relation whose `before` is the edge is made active again.

Tests: `packages/tests/sync/applier-review.test.ts`. Case 11 places the parent on year and the child on month.

## Error codes

Business (one op rolls back, cursor advances): `packages/contracts/src/errors.ts` `businessErrorCodes`. Case 14 expects `rollover_stale`. `outline_conflict` is the two-level / same-period nesting rejection.

### Duplicate relationship replay

The 1.9.0 owner report reproduced an SQLite active-edge uniqueness failure during both pending replay and canonical application. The database was valid; an unclassified duplicate stopped the whole batch. A duplicate active pair or a reused relationship id is `relation_exists`: reject the complete op, keep the existing edge, and continue with the next canonical sequence. Other storage failures still roll back the batch and leave the cursor unchanged.

Failure cases to verify before changing the applier:

- Two offline computers link the same pair under different edge ids. Both must converge on one edge and record the rejected op.
- Pulling the first link while a duplicate local link is pending must rebuild the visible board without changing the pending receipt. Later local edits must remain visible.
- An op edits a task and then creates a duplicate link. Reject the complete op, including its text edits; apply later valid ops.
- A link reuses an existing edge id for a different pair. Preserve the existing edge and reject only that op.
- An unrelated storage error occurs after an earlier valid op in the same batch. Roll back both ops, retain the cursor, and allow retry after the storage error is removed.

Repeatable engine evidence: `pnpm test:sync-replay` writes `apps/desktop/output/tests/sync-replay/report.json`. It uses two isolated desktop repositories, Electron SQLite and the encrypted sync engine with a synthetic remote. It does not establish live Google/Supabase or packaged-desktop acceptance.

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
| C1 wrap | `goalloom/wrap/v1` | `packages/crypto/test/constructs.test.ts`, case 5 |
| C2 roster | `goalloom/roster/v1` | constructs roster chain, cases 6 and 15 |
| C3 op | `goalloom/op/v1` | constructs AAD |
| C4 snapshot / blob | `goalloom/snap/v1`, `goalloom/blob/v1`, 64 KiB chunks | constructs AAD |
| Recovery lock | `goalloom/recovery-lock/v1\|<workspaceId>`, Argon2id `m=8192` `t=2` `p=1` | constructs |
| Checkpoint | `goalloom/recovery-cp/v1` | case 21 |

Unwrap verifies the signature with a caller-supplied trusted public key before decrypting. `rosterWrapTargets` is the roster device ids plus `recovery`. A public key that exists only on the server is not a wrap target (case 6).

A recovery join opens the password lock, then checks that keypair against the checkpoint signature, the roster hash pinned by that checkpoint, and a device signature over the same checkpoint bytes. A copied recovery public key fails (cases 15 and 21). `acceptNewerCheckpoint` rejects a lower `cpVersion`, a `prevCpHash` that does not extend the pinned checkpoint, and any version above `pinned.cpVersion + 1`. Salt and Argon2id parameters sit in the recovery envelope next to the lock. Changing the password re-seals that lock and keeps the same recovery keypair.

Server RPCs are in `supabase/migrations/0001_core.sql`. `_ed25519_verify` calls `pgsodium.crypto_sign_verify_detached` on the message bytes noble's `ed25519.sign` / `ed25519.verify` hash internally. Roster signatures are the 32-byte SHA-256 of `goalloom/roster/v1|` plus canonical JSON (`_roster_message`). `bootstrap_workspace`, `commit_roster`, `rotate_epoch`, and `complete_recovery` all verify that digest. `commit_roster` and `rotate_epoch` require the calling device's authorized signing key. `complete_recovery`, and a `commit_roster` whose signer type is `recovery`, require `recoverySignPub` from the current roster. A mismatch raises `roster_signature_rejected` (`42501`). A missing pgsodium function raises `42501`. On hosted Supabase that verify function is granted; `crypto_sign_new_keypair` is not. The pgTAP file checks noble fixtures from `scripts/gen-ed25519-fixtures.mjs`. Commands are in `supabase/README.md`.

`public.sync_entitled(uuid)` is the only billing hook. `push_ops` and `pull_ops` call it with `auth.uid()` and reject with `42501` when it is false. The shipped body returns true because `public.entitlements` does not exist yet. When that table exists, the function reads `active` for the Supabase user id and treats a missing row as not entitled. Paid sync is RevenueCat later (web billing first); there is no payment code.

## Test index

| # | Where |
| --- | --- |
| 1 | `applyPushReceipts` and `supabase/tests/0001_core.test.sql` |
| 2, 3, 10, 20 | `packages/tests/sync/phase0.test.ts` |
| 4, 16, 17 | `supabase/tests/0001_core.test.sql`; Realtime resubscribe and Storage URLs in `scripts/supabase-remote.mjs` |
| 5, 6, 7, 8, 15, 21 | `packages/tests/sync/adversarial.test.ts` |
| 9, 11, 12, 13, 14, 18, 19 | `packages/tests/sync/phase0.test.ts` |
| C1–C4 vectors | `packages/crypto/test/constructs.test.ts` |

## Deviations from the PRD

- Desktop sources stay in `apps/desktop/src/`. Shared code is `packages/{contracts,crypto,schema,store-core,sync}`. Moving the app to `apps/desktop` is still P1.1.
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
