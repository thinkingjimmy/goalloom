# storage/

> 父级：[main](../README.md)。本地持久化适配器与线程通道，不暴露给 renderer。

```text
storage/
├── client.ts       # main 的请求关联、worker 故障隔离与退出排空
├── worker.ts       # Serial RPC root for commands, current/future/live-past reads, immutable history, period-scoped reviews and transfer after guarded startup
├── startup.ts      # Read-only version probe; v1–v5 refused unchanged, new databases initialize v6
├── database.ts     # node:sqlite 连接、外键/WAL、同步事务与完整性校验
├── schema.ts       # Schema v6, six horizons, DAG/placement/history constraints; no in-place upgrades
├── store.ts        # 有界语句缓存、摘要（含 SQLite 内计算的说明信号 note_signal）/详情读取、索引邻居、版本保护与事件/回执
├── atomic-json.ts  # 窗口偏好、分块导出、备份回执共用的 fsync/原子文件写入
└── backup/
    ├── snapshot.ts # 在线一致性副本、校验/fsync/原子改名和失败清理
    └── manager.ts  # 工作区外回执、流式 hash、指纹复用日常校验、保护边界完整复核
```

`worker.ts` 是本目录唯一装配 workspace 的入口；启动先由 `startup.ts` 以 readOnly 连接探测，v1–v5 只读拒绝且不创建副本，旧源通过导入恢复读取；其余模块提供持久化能力，不调度业务命令。事务规则和恢复流程见 [workspace](../workspace/README.md)。备份副本名由受控代码生成，失败不删除旧副本；回执位于整库替换范围之外。

[PROTOCOL]: Update this header when making changes, then check README.md.
