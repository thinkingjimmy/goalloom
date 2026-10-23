# @goalloom/store-core

INPUT: a synchronous `SqlDriver`, validated SyncOp payloads, and a period materializer supplied by the host.
OUTPUT: canonical application onto `base_*` or the visible projection, the reference `rebuildVisibleFull`, and persisted send-state transitions.
POS: shared sync core. It does not open files, does not import Electron, and does not register SQLite functions. The node:sqlite adapter is `@goalloom/store-core/node`.

`classify.ts` maps duplicate active relationship pairs and reused relationship ids in visible/base projections to `relation_exists`. Canonical replay rejects the complete op and continues; pending replay keeps its receipt and skips the conflicting projection. Other storage errors still abort the transaction.

`undo-create.ts` preflights causal creation completions and `item.undoCreate` groups. A completion needs its creator and untouched item/placement guards. Completions can include a non-null `item.nest` on their sole created item. Group undo validates the net placement, ownership, lifecycle and owned edges for every item before deletion. A peer edit followed by edit-back still rejects a late completion. `apply.ts` runs these checks inside the caller's atomic transaction/savepoint. Two-peer encrypted evidence is produced by the desktop `test:sync-replay` fixture.

`import-calendar.ts` guards initial calendar adoption using items and canonical creation history. Later concurrent imports align placement targets and carried-child source guards to the established calendar. Offline rollover follows only its imported placement predecessor; ordinary intervening moves retain the stale guard. `apply.ts` supplies the target projection calendar to the host period materializer.

`conflicts.ts` uses encrypted `basisSeq` metadata and canonical predecessor changes to retain overwritten local actions. It groups local rejected/lost actions by task, suppresses already-applied duplicates and stores per-task acknowledgement in the existing `sync_conflicts.detail`/`seenAt` fields. Remote rejected operations and causal later edits do not create local review steps. Business projection and original receipts stay intact.

`outline.ts` exports `localParentSql` for both visible/base replay and desktop ordering. Ownership persists across planning placements; only a co-scheduled child is an indented sorting member. Canonical application validates parent availability, two levels and the Later boundary after all actions commit. Peer deletion clears tombstone ownership; deleting an owner with unseen live children is rejected atomically.

Carried `item.place` actions must supply both the group owner and the child's original source scope. `apply.ts` checks that scope and the owner's target before preserving the sibling key. Missing or stale source metadata rejects the complete op; each child remains guarded when offline recovery splits a group across operations.

`sort.ts` shares midpoint/boundary checks with desktop commands. Exhausted numeric gaps normalize only the destination's live placement-local roots or siblings, preserve their relative order and increment placement versions. Normalization does not rewrite receipts or add unrelated semantic placement changes. New canonical move/nesting records capture neighbor anchors; undo validates and restores those anchors instead of an obsolete numeric key. Encrypted creation, manual-link, nesting and undo evidence is part of desktop `test:sync-replay`.

[PROTOCOL]: Update this header when making changes, then check README.md.
