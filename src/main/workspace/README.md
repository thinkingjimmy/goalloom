# workspace/

> 父级：[main](../README.md)。工作区业务服务；依赖纯领域规则、共享契约和 storage 适配器。

```text
workspace/
├── repository.ts     # 用户命令唯一事务入口，复核幂等/代次/版本与配置；六尺度当期摘要、回拨保护与有界参数查询
├── context.ts        # Transaction context, validated periods, ancestor-based flow membership and semantic ordering
├── periods.ts        # Read-only selected-period summaries, generation/revision guards and rollover sources; no period materialization
├── ordering.ts       # Body-free ancestor placement metadata shared by board reads and guarded ordering commands
├── queries.ts        # Count/activity/batch projections and shared trash filtering that excludes empty-detail discards
├── review.ts         # Generation-bound period-end facts, six-scale context with pre-anchor guards, live unfinished placements and exact plans
├── history.ts        # Immutable period-end projections and activity; separate generation-guarded live past-task pages filtered by current placement
├── reconcile.ts      # 自动候选重读、按候选索引查询来源周期、统一核对与原子系统顺延
├── commands/
│   ├── items.ts      # Setup/date revalidation, atomic item writes and flow-valid linking with isolated-parent root promotion
│   ├── plan.ts       # createPlan：写前统一验证既有上级版本，拓扑序每项一个 create、入边归下级；条目可指定未来周期
│   ├── lifecycle.ts  # Independent lifecycle, guarded empty-title discard outside trash, scoped restore and unlink
│   ├── undo.ts       # Owned-field inverses including atomic flow adoption/promotion, color/branch guards, events and holds
│   ├── backlog.ts    # 往期候选复核与批量安排，一个原子用户操作
│   ├── ordering.ts   # Group-checked moves and atomic, reversible half/cycle/month/week/day current/future order materialization
│   └── settings.ts   # Six-horizon policy versions/non-retroactive boundaries, explicit resume and independent batch undo
└── transfer/
    ├── dataset.ts    # v1–v7 validation, v7 export, legacy manual year/half defaults, baseline history and atomic replacement
    ├── rows.ts       # 导出/恢复共用逐行 schema 与数量上限
    ├── files.ts      # worker 内受限 JSON 读取与一致视图的分块原子导出
    └── service.ts    # 源数据校验、预览/保护备份/持续维护/显式提交
```

`storage/worker.ts` 负责装配和串行调用；本目录不依赖 Electron 窗口、IPC 或 renderer。普通命令由 Repository 在权威事务内复核；整库服务维护保护备份与显式确认边界。关键数据、事件与回执全成全败，纯日历/DAG/撤销规则仍在 `src/domain`。

[PROTOCOL]: Update this header when making changes, then check README.md.
