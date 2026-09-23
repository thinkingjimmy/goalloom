# workspace/

> 父级：[main](../README.md)。工作区业务服务；依赖纯领域规则、共享契约和 storage 适配器。

```text
workspace/
├── repository.ts     # 用户命令唯一事务入口，复核幂等/代次/版本与配置
├── context.ts        # 事务上下文、当前周期和语义排序工具
├── history.ts        # from/to 索引分页、只读历史和活动查询
├── reconcile.ts      # 自动候选重读、统一核对与原子系统顺延
├── commands/
│   ├── items.ts      # 首次确认、创建/编辑/移动/关联的字段差量
│   ├── lifecycle.ts  # 独立状态、归档、软删除、还原和解除关联
│   ├── undo.ts       # 效果字段逆转、依赖保护、实际反向事件和 hold
│   ├── backlog.ts    # 往期候选复核与批量安排，一个原子用户操作
│   └── settings.ts   # 策略生效边界、暂停确认与独立批次撤销
└── transfer/
    ├── dataset.ts    # 完整数据读写、无历史 baseline、单事务整库替换
    └── service.ts    # 源数据校验、预览/保护备份/持续维护/显式提交
```

`storage/worker.ts` 负责装配和串行调用；本目录不依赖 Electron 窗口、IPC 或 renderer。普通命令由 Repository 在权威事务内复核；整库服务维护保护备份与显式确认边界。关键数据、事件与回执全成全败，纯日历/DAG/撤销规则仍在 `src/domain`。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
