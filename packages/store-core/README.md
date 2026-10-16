# @goalloom/store-core

INPUT: a synchronous `SqlDriver`, validated SyncOp payloads, and a period materializer supplied by the host.
OUTPUT: canonical application onto `base_*` or the visible projection, the reference `rebuildVisibleFull`, and persisted send-state transitions.
POS: shared sync core. It does not open files, does not import Electron, and does not register SQLite functions. The node:sqlite adapter is `@goalloom/store-core/node`.

`classify.ts` maps duplicate active relationship pairs and reused relationship ids in visible/base projections to `relation_exists`. Canonical replay rejects the complete op and continues; pending replay keeps its receipt and skips the conflicting projection. Other storage errors still abort the transaction.

`undo-create.ts` preflights causal creation completions and `item.undoCreate` groups. A completion needs its creator and untouched item/placement guards. Group undo validates the net placement, lifecycle and owned edges for every item before deletion. A peer edit followed by edit-back still rejects a late completion. `apply.ts` runs these checks inside the caller's atomic transaction/savepoint. Two-peer encrypted evidence is produced by the desktop `test:sync-replay` fixture.

[PROTOCOL]: Update this header when making changes, then check README.md.
