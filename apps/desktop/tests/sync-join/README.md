# First sync acceptance

INPUT: Production SyncService, SDK, storage worker, SQLite and a controlled encrypted cloud.
OUTPUT: Case 1, stable identity, returning-device and deletion evidence under `output/tests/sync-join/`.
POS: Sync-owned E2E. Synthetic credentials/cloud never access a user's account or tasks.

Failure cases and product rules are in [desktop sync](../../../../docs/sync/desktop.md#first-connection-and-returning-devices). `peer.ts` creates offline and pre-sync baseline profiles; `cases.ts` exercises real service/storage peers, failed installs, offline rollover and both registration orders; `native-entry.ts` and the native runner exercise the renderer/preload/IPC.

[PROTOCOL]: Update this header when making changes, then check README.md.
