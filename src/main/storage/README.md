# storage/

> 父级：[main](../README.md)。本地持久化适配器与线程通道，不暴露给 renderer。

```text
storage/
├── client.ts       # main 的请求关联、worker 故障隔离与退出排空
├── worker.ts       # 串行 RPC 组合根：等待启动编排后装配 workspace 服务，报告 startup 状态
├── startup.ts      # 只读探测 user_version/schema → 现有 BackupManager 创建并校验 protective 副本 → 复核后原子迁移
├── database.ts     # node:sqlite 连接、外键/WAL、同步事务与完整性校验
├── schema.ts       # schema v3，DAG/唯一位置/流程颜色/历史/操作约束，v1/v2→v3 单事务升级（只做 DDL 与版本）
├── store.ts        # 参数化批量读取、版本保护、事件/回执适配
├── atomic-json.ts  # 窗口偏好、导出、备份回执共用的原子文件写入
└── backup/
    ├── snapshot.ts # 在线一致性副本、校验/fsync/原子改名和失败清理
    └── manager.ts  # 工作区外备份回执、本地日去重、仅日常副本轮换
```

`worker.ts` 是本目录唯一装配 workspace 的入口；启动先由 `startup.ts` 以 readOnly 连接探测，旧版本须保护副本创建且校验通过、源未变化才迁移，任一失败都不开放业务、不升版本；其余模块提供持久化能力，不调度业务命令。事务规则和恢复流程见 [workspace](../workspace/README.md)。备份副本名由受控代码生成，失败不删除旧副本；回执位于整库替换范围之外。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
