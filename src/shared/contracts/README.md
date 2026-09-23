# contracts/

> 父级：[项目地图](../../../README.md)。不可信 IPC/导入的数据边界。

```text
contracts/
├── entities.ts   # 工作区、实体、唯一位置、DAG 边和周期 schema
├── commands.ts   # 有限写命令、代次/版本、错误与操作结果
├── effects.ts    # 不可变效果描述和不含正文的历史事件
├── history.ts    # 严格事件、期末投影、后续活动和历史分页
├── queries.ts    # 分页查询、当前快照和详情 DTO
└── runtime.ts    # 有限 preload API 和运行时诊断
```

Zod 在 main/worker 拒绝额外字段；preload 校验返回 DTO。renderer 不能传入 SQL、路径、时钟或任意撤销字段。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
