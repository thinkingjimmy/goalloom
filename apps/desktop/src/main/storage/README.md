# storage/

> 父级：[main](../README.md)。本地持久化适配器与线程通道，不暴露给 renderer。

```text
storage/
├── clear-local.ts  # Explicit sign-out file handoff, rollback receipts, fresh verified database and removal of local task copies/project-scoped sync credentials
├── client.ts       # main 的请求关联、worker 故障隔离与退出排空
├── workspace-clock.ts # Native Date observation/scheduler dependency; no configuration or IPC clock control
├── worker.ts       # Serial RPC root for guarded captures, bounded body-free goal labels, current/future/live-past reads, immutable history, period reviews and transfer
├── startup.ts      # Read-only version probe; verified protection before v8-v13 upgrades to v14, explicit recovery for older sources
├── upgrade.ts      # Verified legacy copy, temporary current-version database preserving source appearance and confirmed atomic file handoff
├── database.ts     # node:sqlite 连接、外键/WAL、同步事务与完整性校验
├── schema.ts       # Schema v14 with same-binding epoch receipts, guidance observations and live/base appearance constraints, sync/nesting projections, immutable creation-completion ownership index and guarded additive upgrades
├── store.ts        # Bounded statements and body-free summaries, indexed outline children/neighbors, stable inheritedRelationId, versioned writes and receipts
├── atomic-json.ts  # 窗口偏好、分块导出、备份回执共用的 fsync/原子文件写入
└── backup/
    ├── snapshot.ts # 在线一致性副本、校验/fsync/原子改名和失败清理
    └── manager.ts  # 工作区外回执、流式 hash、指纹复用日常校验、保护边界完整复核
```

`worker.ts` 是本目录唯一装配 workspace 的入口。`startup.ts` 先以 readOnly 连接探测；v8–v13 创建并验证保护副本后，在事务内升级至 v14。v1–v7 沿用显式恢复：用户确认保护副本后转换为临时当前版本数据库，再原子替换。取消保留原库，副本保持可恢复。JSON/SQLite 导入同时验证创建与补全的归属、净效果和整组撤销标记。事务规则见 [workspace](../workspace/README.md)。备份副本名由受控代码生成，失败不删除旧副本；回执位于整库替换范围之外。

`Store.localParentId` and store-core's `localParentSql` resolve the same horizon/period grouping without changing the persisted owner. Remote children share ordinary placement neighbors.

[PROTOCOL]: Update this header when making changes, then check README.md.
