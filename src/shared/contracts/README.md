# contracts/

> 父级：[项目地图](../../../README.md)。不可信 IPC/导入的数据边界。

```text
contracts/
├── entities.ts   # 工作区、实体 summary/detail、唯一位置、DAG 边和周期 schema
├── wire-calendar.ts # Gregorian 日期与 IANA 时区的轻量边界校验，不引入 Temporal
├── validation-metrics.ts # 默认关闭的 preload 日期校验数值计时
├── commands.ts   # 有限写命令（含 createPlan/ParentRef）、代次/版本、错误与操作结果（计划多 itemIds）
├── effects.ts    # 不可变效果描述和不含正文的历史事件
├── history.ts    # 严格事件、期末投影、后续活动和历史分页
├── transfer.ts   # v1–v5 完整数据集、效果白名单、备份/恢复/重置确认与批次分页 DTO
├── smart-input.ts # Jev 服务、设备状态、智能动作、修订回声的判断回复与预览 DTO
├── queries.ts    # 摘要快照/列表、完整详情、拓扑、数量及活动/备份摘要 DTO
└── runtime.ts    # 有限 preload API（含 smart 与语言偏好读写）、LanguageState 和运行时诊断
```

Zod 在 main/worker 拒绝额外字段；preload 校验返回 DTO。renderer 不能传入 SQL、路径、时钟或任意撤销字段。

[PROTOCOL]: Update this header when making changes, then check README.md.
