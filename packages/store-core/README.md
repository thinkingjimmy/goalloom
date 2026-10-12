# @goalloom/store-core

INPUT: a synchronous `SqlDriver`, validated SyncOp payloads, and a period materializer supplied by the host.
OUTPUT: canonical application onto `base_*` or the visible projection, the reference `rebuildVisibleFull`, and persisted send-state transitions.
POS: shared sync core. It does not open files, does not import Electron, and does not register SQLite functions. The node:sqlite adapter is `@goalloom/store-core/node`.
