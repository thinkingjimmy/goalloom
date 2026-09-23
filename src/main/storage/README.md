# storage/

> 父级：[main](../README.md)。仅供受控主进程/worker 调用，不暴露 renderer。

```text
storage/
├── database.ts    # node:sqlite 连接、外键/WAL、同步事务与完整性校验
├── backup.ts      # 在线一致性副本、校验/fsync/原子改名和失败清理
└── worker.ts      # 隔离线程启动，读取真实 SQLite 版本
```

`database.ts` 不包含业务 DDL；D06/D07 冻结后再建立生产迁移。`consistentBackup` 是基础原语，不实现日常轮换或整库恢复/维护会话，不能替代 M4 验收。副本名由 main 生成，失败不删除旧副本。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
