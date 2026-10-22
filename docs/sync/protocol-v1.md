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
{ v: 1, opId: uuid, deviceId: string, at: iso, actions: Action[], basisSeq?: number, creationOperationId?: uuid, importedCalendar?: Calendar }
```

`at` is display and injection time. It is not a sort key. Server order is `seq`.

`basisSeq` is the writer's observed apply cursor, captured in the same local command transaction and carried only inside ciphertext. It does not change canonical ordering or reject a field update. When an incoming change overwrites a local canonical predecessor whose sequence exceeds that cursor, the losing local actions become a task-grouped review. Causally later remote edits stay silent. Missing metadata retains legacy rejected-operation review. Both peers need this metadata-capable build; older strict parsers reject an unknown field without advancing. Review acknowledgement uses existing local `sync_conflicts` metadata; an explicit local resolution is a new ordinary op guarded against the displayed owned values/deletion identity. See `tests/sync-review/cases.ts` and [desktop sync](desktop.md#sync-difference-review).

`importedCalendar` is encrypted, validated source-calendar metadata for a first import. The first populated import may replace an initial empty calendar only before any item or canonical creation history exists; tombstones also prevent adoption. Once populated, the canonical calendar wins. Later concurrent imports skip their calendar/policy setup and deterministically align their placements to that calendar. The applier uses the target projection's calendar, including while the base and visible projections differ. An offline rollover with source sequence zero can follow its own imported placement chain, identified by the source calendar; an intervening ordinary placement cannot satisfy that guard. Current source period, todo status and auto policy are still checked. Both peers need this metadata-capable build; older strict schemas reject it without advancing their cursor. No server schema or plaintext metadata is added.

Actions (one user command is one atomic op):

| Action | Meaning |
| --- | --- |
| `item.create` | Insert one item and its placement. `id` is the local id. Optional `parentId` does not itself insert an edge when a `rel.link` for the same pair is present. |
| `item.set` | Field diff: `title`, `description`, `dueDate`, `flowColor`. Only changed keys are present. |
| `item.status` | `todo` / `done` / `cancelled` plus the matching timestamps. |
| `item.place` | Horizon, period key and sort hint. `reason` is `move`, `arrange` or `rollover`. Sort uses placement-local root/sibling scope; ownership is unchanged. A carried child supplies both `groupRootId` and `groupFrom: { horizon, periodKey }`; its period changes without reallocating its sibling sort key. |
| `item.nest` | Set or clear `nestingParentId` and the resulting horizon, period and sort. `parentId` null makes the task independent. |
| `item.archive` | `archivedAt` set or cleared. |
| `item.delete` / `item.restore` | Soft delete. Restore requires `expectedDeleteOpId`. |
| `item.undoCreate` | Delete a creation group after checking its `creationOperationId`, `completionOperationIds`, net placement, lifecycle and owned edges. All members are checked before any write. |
| `item.discardIfEmpty` | Delete only when the domain empty-card predicate matches `expectVersion`. |
| `item.rollover` | System op with deterministic UUIDv5. Optional `sortHint` preserves committed neighbors; optional `groupRootId` identifies the source-local group. See rollover below. |
| `rel.link` / `rel.unlink` | Edge id is allocated on the writer and copied into the action. |
| `guidance.set` | Note body plus `baseRevision`. |
| `policy.set` | One horizon, `auto` or `manual`, effective from a period key. |
| `calendar.setup` | The confirmed calendar. Later calendar edits are not a sync action. |
| `revert` | `targetOpId` plus `all_or_nothing` or `per_dimension`. |

## Command map

Local commands run first. The SyncOp is the diff plus the intent, written in the same `BEGIN IMMEDIATE` transaction (`apps/desktop/src/main/workspace/sync/emit.ts`).

Creation sort hints must preserve the committed position, including automatic parent placement and explicit insertion. They use active root neighbours in the same column/period; nested or deleted rows and items created later in that same op cannot be anchors. A create-plus-nest keeps its existing pre-nesting root position followed by the ordered nesting action. Failure cases: local placement is correct but pending rebuild/canonical echo appends it; a multi-item plan refers forward and changes order; future periods leak into current anchors; undo/restore loses a synced creation's final position. Two-peer evidence belongs to `test:sync-replay`.

Forward-period movement and backlog arrangement also capture the committed root neighbors after parent placement. Replay does not consult the receiving device's preference. Writers identify carried children from the source horizon/period before moving the root; separately scheduled children retain their placement and ownership. Carried `item.place` actions include `groupRootId` and the child's original `groupFrom` scope. Replay requires that owner at the target placement and the child still in its declared source scope before preserving its sibling key. Missing source metadata or a concurrent independent child move rejects the whole op with `outline_conflict`; it cannot copy a root-scope key into a sibling group. `groupFrom.periodKey` is null only for Later. Imported-calendar mapping aligns the source guard as well as the target, including moves to Later.

The root position and carried children remain in one manual command op. Pre-sync recovery reads anchors, group identities and source scopes from immutable receipts. Every child carries its own source guard, including when a recovered rollover is split at the 200-action boundary and its root is in an earlier op. Coverage: encrypted manual/backlog concurrent-child rejection and offline group replay in `tests/fixtures/sync-rollover-placement.ts` through `pnpm test:sync-replay`.

| Command | SyncOp | Test |
| --- | --- | --- |
| `confirmSetup` | `calendar.setup` | `apps/desktop/tests/integration/sync-emit.test.ts` (setup row exists before other actions) |
| `create` / `createPlan` | one SyncOp: `item.create` and, when a parent edge was inserted, `rel.link` | sync-emit create; `apps/desktop/tests/integration/sync-emit-commands.test.ts` |
| `completeCreation` | `item.place` / `rel.link`, with top-level `creationOperationId`. No model request or write command is synced | `tests/fixtures/sync-replay.ts` |
| `undo` of a captured creation | one atomic op with `item.undoCreate` per created item, referencing its creator and completions. Keep queued creator/completion ops even when never sent | `tests/fixtures/sync-replay.ts` |
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
| `undoBatch` of a system rollover | each undone `item.rollover`: `never_sent` becomes `reverted_local`; `send_unknown`, `accepted` or `applied` gets its own `revert` op. Shared reverse-effect ordering returns the source root before its carried children; skipped effects are left alone | sync-emit-commands; `tests/fixtures/sync-rollover-placement.ts` |
| `preferences`, `backupPreferences` | `pref.set`, one action per changed key. Last writer wins per key (`at`, then `opId`) | sync-emit; `packages/tests/sync/settings-sync.test.ts` |
| `confirmClock`, `confirmRollover` | none | sync-emit; confirmRollover in sync-emit-commands |
| reconcile rollover | one local `operations` receipt, plus one `item.rollover` per moved root and per grouped child whose `base_item_placements` period still matches the source | cases 13 and 14 |

## Settings

User-facing preferences and API keys ride the same op log. There is no separate switch: once sync is on, a change emits `pref.set`. The value is sealed with the workspace key before upload. The server stores ciphertext.

`sync_settings` is an additive side table (`CREATE TABLE IF NOT EXISTS`). It does not change the v8 business DDL or `user_version`. A replay writes the row when the incoming `at` is newer, then the same `at` with a greater `opId`. The same `opId` does not write again. Workspace columns (`theme`, `style`, `checkStyle`, backup) are projected onto the visible workspace after replay. Language, renderer preferences and API keys are applied live by the desktop: language updates the device preference file, renderer keys update the open window, and an API key is read from the writer's keychain, sealed inside the op, then written into the other computer's keychain. The workspace database stores a sha256 fingerprint of the key, not the key. Backups drop secret rows and secret actions, then VACUUM, so the backup file does not contain the key.

Week start, timezone, calendar mode and the cycle anchor stay on `calendar.setup`. Rollover policy stays on `policy.set`.

These stay on the device: window size and position, the sync refresh token and session tokens, device id, the sync password and every key derived from it, clock anomaly, restore pause, workspace generation, review drafts and summary cache, dismissed notices, insight reviewed / dismissed / onboarded marks, and the link preview cache.

## Send states

Automatic creation completion is causal. `undo-create.ts` requires the referenced creation, an independent live todo with its original item/placement guards, and only placement/parent-link actions. An intervening peer edit, including edit-back, rejects the entire completion. `item.undoCreate` validates the combined creator/completion effect and allows unrelated text edits; it rejects lifecycle, placement, outline or relation conflicts. Local creation and completion receipts remain immutable. The grouped undo has one user-visible history entry; its delete provenance lets scoped restore recover the final placement and eligible edges. Encrypted two-peer evidence is in `output/tests/sync-replay/`.

`never_sent → send_unknown → accepted → applied`, plus `reverted_local` and `quarantined`.

- `send_unknown` is written before the request leaves the device.
- The sticky trigger `sync_ops_send_state_irreversible` rejects any update to `never_sent` or `reverted_local` once the row has left `never_sent`. `never_sent → reverted_local` is allowed.
- `outcome` is written only when the op is applied at its canonical `seq`.
- Tests: `apps/desktop/tests/integration/upgrade-v9.test.ts` (trigger), `packages/tests/sync/phase0.test.ts` cases 2, 3, 10, 20.

## Baseline

First-join planning reads the complete verified history. A cloud with only calendar, policy and preference operations is pristine. Zero live items alone is not sufficient. Same-cloud bound devices resume their existing cursor/outbox; paused/restored devices require a decision. An unbound source joining a pristine cloud keeps its never-sent operation and task IDs, attaches its source calendar, and installs atomically with the remote metadata. Only never-sent payloads may be changed. First connection also preserves implicit setup policies and already-applied offline placements that were absent from the ordinary outbox. The desktop host reads immutable local rollover effects, excludes effects already undone, and inserts missing operations before subsequent user commands, so later ordering and deletions remain valid. Preparation replays the source log, fills remaining defaults, and rejects a changed task projection atomically. Explicit merges into established boards preserve unknown item IDs and exclude known IDs, including tombstones, instead of allocating new identities. A repeated install on the same binding resumes and never imports again. The storage transaction rechecks the plan and captured local generation; backup preparation precedes installation.

Confirmed state lives in `base_*`, cloned from the seven business tables (constraints included). Visible rows are `base_*` plus pending ops (`never_sent`, `send_unknown`, and `accepted` with `seq > lastAppliedSeq`).

A first-device baseline writes `calendar.setup` (with `confirmedAt` when the board was already confirmed) and each `policy.set` as their own ops, then the remaining actions in chunks of 200. Snapshot `rel.link` actions set `retain: true`. Replay of those baseline op ids does not swallow business errors: the baseline transaction rolls back and sync pauses. A launch with an empty `setupConfirmedAt` and a rejected local op whose first action is `calendar.setup` rebuilds the board from that op's stored payload. That repair deletes the `sync_conflicts` rows for the baseline and for `item.rollover` rejections that sit before the next applied op. A board that is already confirmed drops those same rows once, while the baseline conflict is still present.

`mergeRemoteOps` requires `seq = lastAppliedSeq + 1`. Each op runs in a `SAVEPOINT`. Business errors record `rejected` and a `sync_conflicts` row; the cursor still advances. Storage errors abort the transaction and leave the cursor unchanged (case 3).

`rebuildVisibleFull` preserves device-local workspace columns, copies `base_*` back, then replays pending ops. `operations` rows are not deleted. Visible `workspace.revision` becomes the greater of the visible counter and `base_workspace.revision`, so a local command does not roll the renderer guard backward. Tests: cases 9, 11, 12, 19 and `packages/tests/sync/applier-review.test.ts`.

`canon_ops` / `canon_changes` are appended only at the canonical seq. `dim` is one of `create`, `delete`, `restore`, `title`, `description`, `dueDate`, `flowColor`, `status`, `archive`, `placement`, `relation`, `guidance`, `policy`, `calendar`. A revert walks that op's canon rows from the last index backward and writes the inverted value under the original `dim`. For a group-period move, it restores the root's guarded source slot before its carried children; other dimensions keep their reverse order. This prevents temporarily independent children from becoming false root neighbors. Outline membership is the `placement` dimension: `before` / `after` include `nestingParentId` when the writer recorded it. A placement row written before nesting leaves that field untouched.

Desktop writes and replay share `packages/store-core/src/sort.ts`. When a numeric gap is exhausted or a key is unsafe, normalize only the affected visible/base root or sibling scope in its existing order, then allocate the new key. Placement versions increase; old operations, payloads and receipts are not rewritten. New canonical placement/nesting `before` values include semantic `sortHint` neighbors. Revert validates their current adjacency and allocates a fresh key, so normalization alone does not invalidate undo; a changed slot still conflicts. Carried-child effects own period and ownership only, preserving their sibling key during movement and undo. Deterministic gap and earlier-undo coverage lives in `tests/fixtures/sync-sort-gaps.ts`.

The reference applier (`packages/store-core/src/apply.ts`) additionally:

- `rel.link` rejects Later and any parent that is not in a strictly longer horizon (`horizon_order`). `retain: true`, or a `calendar.setup` in the same op, keeps an edge that a move, undo, restore or import already kept. Cycles stay on the SQLite trigger (`relation_cycle`).
- `calendar.setup` may include `confirmedAt`. When it is absent, the op's `at` is stored as the confirmation time.
- A colored child requires `adoptParentFlow`. The color is cleared on the child and copied to the parent only when that parent is uncolored and has no active edge.
- `item.place` into Later records a relation change for each parent edge it invalidates. A `rel.unlink` for an edge this same op already invalidated does not record a second change. Sort is scoped to the placement-local parent; a remotely owned child sorts among root rows without changing its owner.
- `item.nest` requires the same horizon and period as the parent, a root parent, and a child with no live children, flow color or incoming goal edge. Two-level and same-period failures are `outline_conflict`. The SQL triggers remain the cycle and color backstop.
- `item.restore` revives edges with `reason='delete'` and `invalidatedBy` equal to `expectedDeleteOpId`, skipping a deleted other endpoint, a flow-root child, a duplicate, or a cycle. A flow color taken by a live item stays with that item.
- `item.delete` records a relation change for each edge it invalidates, before the delete change. Revert restores those edges after the item is live again. A trigger failure rejects the whole revert.
- Revert of `item.create` is `revert_superseded` when an active relation still touches the item. A link in the same op is inverted first, so that edge does not block the revert.
- `guidance` revert writes the previous value and increments `item_guidance.revision`.
- `item.set` of a non-null `flowColor`, and `item.create` into Later with a flow color, are `horizon_order`. Clearing a color is allowed.
- Placement revert restores semantic neighbors when recorded, otherwise the recorded `sortKey`; carried children retain their existing sibling key. A relation whose `before` is null is invalidated; a relation whose `before` is the edge is made active again.

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

`opId = UUIDv5("rollover:<itemId>:<fromHorizon>:<fromStart>@<placementSeq>:<toHorizon>:<toStart><intent>", workspaceId or generation)`.

`intent` is empty when both optional placement fields are absent. Otherwise it is `":" + JSON.stringify({ sortHint: sortHint ?? null, groupRootId: groupRootId ?? null })`, with those fixed property names/order and `sortHint` normalized as `{ afterId, beforeId }`. Identical source and placement intents deduplicate. Different device placements create distinct causal candidates; after one wins, a stale candidate rolls back with `rollover_stale`, rather than reusing an op ID with a different payload.

System rollover sets top-level `basisSeq` to `from.placementSeq`, and outbox insertion preserves that explicit value. Equal rollover identities therefore produce equal payloads even when the devices have observed different unrelated canonical changes.

`position: 'append'` remains on the wire; absent `sortHint` uses that fallback. A present hint carries the committed target neighbors. Group actions include `groupRootId` on the root and its carried children. Replay checks each source period and predecessor, the root's source/target placement, ownership and auto policy. A root requires an active todo member in the source placement; a carried child can use a member in source or target after the root has moved. This lets hidden roots and inactive siblings travel with an eligible local child without accepting a preexisting remote child as the source group. Older strict schemas reject these optional fields; queued payloads are not rewritten.

A rollover whose `placementSeq` or period does not match the base placement is `rollover_stale` (case 14). Pending placement edits do not emit a rollover. Deterministic legacy identity remains covered by case 13; parent-placement identity, concurrent candidates, group replay and undo belong to `tests/fixtures/sync-rollover-placement.ts`.

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

## Recovery RPC reference

Apply `0009_sync_security.sql` after `0008_sync_cost.sql`. Device/session ownership remains authoritative and all cloud task data stays encrypted.

| RPC | Contract |
| --- | --- |
| `list_account(p_workspace uuid default null)` | An explicit owned ID returns that binding or null. No ID selects the newest owned workspace, ordered by creation time and ID. Returning clients must pass their pinned ID. |
| `bootstrap_workspace(...)` | Initial account setup. Existing behavior remains available for first use. |
| `create_new_workspace(p_device, p_workspace, p_generation, p_roster, p_roster_hash, p_roster_sig, p_checkpoint, p_rec_sig, p_dev_sig)` | Non-destructive recovery. Requires authentication, a session-bound device and entitlement. Verifies initial roster identity, canonical hashes and device/recovery checkpoint signatures. Exact signed retries are idempotent. Existing workspaces, operations, keys and devices remain unchanged. Envelopes follow through the existing authorized `put_key_envelopes` call. |
| `reset_sync(p_device, p_workspace)` | **DESTRUCTIVE — use `create_new_workspace` instead.** Deletes only the explicitly selected owned workspace and its cascading data. Account-wide `reset_sync(uuid)` is removed. Desktop IPC requires `DELETE ALL CLOUD DATA` before calling it. |

The client uses fresh cloud generations for recovered workspaces; local generation remains the storage write guard. A durable encrypted recovery draft reuses keys and identity after unknown outcomes. New-key exchange cannot start before baseline and binding commit together. Old devices retain their explicit workspace binding and can continue exchanging against it. No automatic orphan deletion is installed.

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

## Target-version control reads and bounded sends

`get_sync_status(workspace, device)` returns only workspace/generation, head, roster/epoch, retained boundary and minimum read/write versions. It verifies the authenticated session, device authorization, ownership and entitlement without updating counters or last-seen timestamps. The client rejects unsupported versions, mismatched bindings and missing retained operations. Metadata never substitutes for roster signatures or authoritative write checks.

A desktop turn reads independently of upload success, applies one continuous page, and sends at most one original ordered batch. Peek does not change state. Only chosen IDs transition to `send_unknown`; accepted receipts cannot skip the replay cursor. Unknown receipts must match the restored plaintext payload hash, including secret preferences. The local workspace generation guards storage writes; the cloud generation guards remote binding. They can differ after join.

All remote methods accept an optional cancellation context. The HTTP adapter combines it with lifecycle cancellation and a request deadline covering token/headers/body. Late callbacks cannot apply results. Deadlines and independent upload/read recovery are specified in [desktop sync](desktop.md#adaptive-synchronization). The E2E failure matrix is maintained with the local cost plan; repeatable production-service evidence is produced by `pnpm test:sync-scheduling`.
