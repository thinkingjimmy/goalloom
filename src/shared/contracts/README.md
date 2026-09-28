# contracts/

> 父级：[项目地图](../../../docs/development.md)。不可信 IPC/导入的数据边界。

```text
contracts/
├── values.ts     # Lightweight ordered horizon/provider values for schema definitions and renderer controls
├── entities.ts   # 工作区、实体 summary/detail、唯一位置、DAG 边和周期 schema
├── wire-calendar.ts # Gregorian 日期与 IANA 时区的轻量边界校验，不引入 Temporal
├── commands.ts   # Finite writes, parent-group-aware moves, atomic materializeParentOrder, planning targets and guarded receipts
├── effects.ts    # 不可变效果描述和不含正文的历史事件
├── history.ts    # Strict events, immutable period-end projections/activity and separate revision-bound live past-task pages
├── transfer.ts   # v1–v5 完整数据集、效果白名单、备份/恢复/重置确认与批次分页 DTO
├── smart-input.ts # Jev 服务、设备状态、智能动作、修订回声的判断回复与预览 DTO
├── link-preview.ts # Strict public link preview/open actions and bounded inert metadata; lightweight syntax lives in ../links.ts
├── queries.ts    # Current/future summaries with ancestor metadata, generation-guarded pastPeriod pages, details/search, immutable history and counts
└── runtime.ts    # Fixed preload API including getBoardPeriods/getPastPeriod, smart input, language preferences and runtime diagnostics
```

Zod 在 main/worker 拒绝额外字段；preload 校验返回 DTO。renderer 只导入轻量 values 和类型，不构造 schema；构建门槛拒绝 renderer 引入 Zod。renderer 不能传入 SQL、路径、时钟或任意撤销字段。

[PROTOCOL]: Update this header when making changes, then check README.md.
