# storage/

> 父级：[main](../README.md)。仅供受控主进程/worker 调用，不暴露 renderer。

```text
storage/
├── database.ts    # node:sqlite 连接、外键/WAL、同步事务与完整性校验
├── backup.ts      # 在线一致性副本、校验/fsync/原子改名和失败清理
├── backup-manager.ts # 工作区外备份回执、本地日去重、仅日常副本轮换
├── schema.ts      # schema v1，DAG/唯一位置/历史/操作约束和迁移
├── store.ts       # 参数化 SQL 读写、版本保护、事件/回执适配
├── context.ts     # 事务上下文、当前周期和语义排序工具
├── core-commands.ts # 首次确认、创建/编辑/移动/关联的字段差量
├── lifecycle.ts   # 独立状态、归档、软删除、还原和解除关联
├── undo.ts        # 效果字段逆转、依赖保护、实际反向事件和 hold
├── history.ts     # from/to 索引分页、只读历史和活动查询
├── backlog.ts     # 往期候选复核与批量安排，一个原子用户操作
├── settings-commands.ts # 策略生效边界、暂停确认、独立批次撤销
├── reconcile.ts   # 自动候选重读、统一核对和原子系统顺延
├── transfer.ts    # 完整数据读写、无历史 baseline、单事务整库替换
├── workspace-service.ts # 原生源数据校验、预览/保护备份/持续维护/显式提交
├── repository.ts  # 唯一事务入口、幂等/代次/版本复核和查询
└── worker.ts      # 串行存储 RPC、真实 SQLite 连接和导出
```

`schema.ts` 采用负责人最终确认的多父 DAG。`repository.ts` 在事务内检查配置、代次和当前版本；关键数据/事件/回执全成全败。`consistentBackup` 是基础原语，不能替代 M4 完整恢复/维护验收。副本名由 main 生成，失败不删除旧副本。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
