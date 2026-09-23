# contracts/

> 父级：[项目地图](../../../README.md)。不可信 IPC/导入的数据边界。

```text
contracts/
├── entities.ts   # 工作区、实体、唯一位置、DAG 边和周期 schema
├── commands.ts   # 有限写命令（含 createPlan/ParentRef）、代次/版本、错误与操作结果（计划多 itemIds）
├── effects.ts    # 不可变效果描述和不含正文的历史事件
├── history.ts    # 严格事件、期末投影、后续活动和历史分页
├── transfer.ts   # v1/v2/v3 完整数据集、效果白名单、备份/恢复/重置确认 DTO
├── smart-input.ts # Jev 服务、设备状态、智能动作、修订回声的判断回复与预览 DTO
├── queries.ts    # 列表视图类型、分页查询、当前快照和详情 DTO
└── runtime.ts    # 有限 preload API（含 smart）和运行时诊断
```

Zod 在 main/worker 拒绝额外字段；preload 校验返回 DTO。renderer 不能传入 SQL、路径、时钟或任意撤销字段。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
