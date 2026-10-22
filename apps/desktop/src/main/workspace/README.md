# workspace/

> 父级：[main](../README.md)。工作区业务服务；依赖纯领域规则、共享契约和 storage 适配器。

```text
workspace/
├── repository.ts     # 用户命令唯一事务入口，复核幂等/代次/版本与配置；六尺度当期摘要、回拨保护与有界参数查询
├── context.ts        # Transaction context, validated periods, ancestor-based flow membership and shared gap-safe allocation within one placement-local sibling scope
├── periods.ts        # Read-only selected-period summaries, generation/revision guards and rollover sources; no period materialization
├── ordering.ts       # Body-free ancestor placement metadata shared by board reads and guarded ordering commands
├── queries.ts        # Count/activity/batch projections and shared trash filtering that excludes empty-detail discards
├── review.ts         # Generation-bound period-end facts, six-scale context with pre-anchor guards, board-ordered live unfinished outlines by source period, body-free closingParents and exact plans
├── execution.ts      # Indexed 5,000-event facts, all event-owned undo, replayed guidance and frozen month/day/all pages with exact local end boundaries
├── assistance-context.ts # Bounded task/relationship context, exact omissions and transaction dependency guards
├── history.ts        # Immutable period-end projections and activity; separate generation-guarded live past-task pages filtered by current placement
├── reconcile.ts      # Revalidated source-local rollover groups, captured placement preference, atomic system batches and committed sync anchors
├── commands/
│   ├── items.ts      # Setup/date guards, atomic creation/nesting/link placement, forward-period auto-placement with explicit-slot priority, source-local group moves and persistent remote ownership
│   ├── nesting.ts    # Guarded leaf/group nesting with ordered flattening and atomic sibling insertion, explicit root-slot detachment, inherited-parent materialization and combined outline/goal validation
│   ├── plan.ts       # createPlan：写前统一验证既有上级版本，拓扑序每项一个 create、入边归下级；条目可指定未来周期
│   ├── capture.ts    # Optional ready matches and late column/parent completion, guarded by creation identity, task versions and live periods
│   ├── assistance.ts # Atomic guarded note rewrites (description-only v2 effects), legacy guidance/placement and receipt-first undo
│   ├── lifecycle.ts  # Independent lifecycle, parent deletion promotion, creation-receipt group restore, non-stealing outline restore, guarded discard and unlink
│   ├── undo.ts       # Owned-field inverses including atomic flow adoption/promotion, color/branch guards, events and holds
│   ├── backlog.ts    # Selected item/placement version guards, source-ordered batch arrival and captured parent placement in one undoable operation
│   ├── ordering.ts   # Visible local-group placement on creation/parent changes/rollover, including hidden roots with visible children; atomic current/future column arrangement
│   └── settings.ts   # Six-horizon policy versions/non-retroactive boundaries, explicit resume and independent batch undo
└── transfer/
    ├── dataset.ts    # Strict v1-v11 import/export, warned current-data recovery for verified application backups, immutable source files and atomic replacement
    ├── rows.ts       # 导出/恢复共用逐行 schema 与数量上限
    ├── files.ts      # worker 内受限 JSON 读取与一致视图的分块原子导出
    └── service.ts    # 源数据校验、预览/保护备份/持续维护/显式提交
```

`sync/emit.ts` preserves committed creation positions with active same-period root anchors, excluding later creates in the same op. Atomic create-plus-nest retains its pre-nesting position and ordered nesting action. Existing receipts and queued payloads remain immutable.

Rollover captures the placement preference before entering the worker transaction. `move` and `arrangeBacklog` keep one final root-position effect plus source-local child effects; explicit slots win and existing target rows keep their relative order. `sync/emit.ts` and `sync/offline.ts` carry committed anchors, group identity and each child's original source scope. Replay rejects a stale carried child before preserving its sibling key, including across offline recovery chunks. Canonical group undo restores the root slot before its followers. Shared sort-key normalization preserves neighbor order without rewriting old receipts.

`sync/local.ts` owns first-join planning, history-aware empty state, protected installation, atomic recovery baseline/binding and generation guards at the storage boundary. `sync/offline.ts` reads immutable pre-sync rollover effects, excludes undone effects, and orders missing sync operations before later user edits/deletions. Returning devices preserve cursor and pending receipts.

The protected production transition uses the existing visible-baseline transaction, then clears the legacy project binding in that same transaction. Business/history rows remain; old canonical receipts and ciphertext are not sent to the new project. Unknown old sends are counted in the private transition receipt.

Unbound, never-sent workspaces keep their original outbox and history. Only the backup-receipt path can recover a valid current projection when its old history fails validation; previews warn that confirmed restoration starts new history. Original SQLite bytes remain unchanged. External imports and startup upgrades retain strict complete-history validation, and invalid current data still fails.

`sync/review.ts` reads one task group at a time, previews lost actions inside a rolled-back savepoint and hashes only owned values/lifecycle/dependencies. `Repository` dispatches `resolveSyncReview` in its normal generation/receipt transaction. A local choice appends one new SyncOp and history event with the acknowledgement; a synced choice only acknowledges. Invalid relations remain unavailable, and only an explicit local choice can restore the target deletion.

Rejected offline creations retain their later local edits in that same group. The preview can keep the original task ID as an independent task after its parent was deleted; the missing/deleted parent is not recreated. A changed normalized action plan invalidates the preview token.

`storage/worker.ts` 负责装配和串行调用；本目录不依赖 Electron 窗口、IPC 或 renderer。普通命令由 Repository 在权威事务内复核；整库服务维护保护备份与显式确认边界。关键数据、事件与回执全成全败，纯日历/DAG/撤销规则仍在 `apps/desktop/src/domain`。

[PROTOCOL]: Update this header when making changes, then check README.md.
