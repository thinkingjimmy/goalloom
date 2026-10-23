# contracts/

> 父级：[项目地图](../../../../../docs/development.md)。不可信 IPC/导入的数据边界。

```text
contracts/
├── values.ts     # Seven ordered horizons, six period/policy horizons, anchored subsets and the shared next-horizon map
├── entities.ts   # 工作区、rolling/natural 日历、实体 summary/detail、唯一位置与 nestingParentId、DAG 边和周期 schema
├── wire-calendar.ts # Gregorian 日期与 IANA 时区的轻量边界校验，不引入 Temporal
├── commands.ts   # Public finite writes, guarded atomic single/plan nested creation, optional capture refs/automatic parents; internal-only completeCreation, scoped undo and atomic root/subtask insertion on nest/unnest
├── capture.ts    # Shared input revisions/explicit target, capture intent, transaction-created guards, bounded semantic goal/owner selections and owner placement versions
├── assistance.ts # Strict Markdown rewrite/guidance outputs, full echoes, bounded context and dependency guards
├── execution.ts  # Per-metric quality, authoritative pressure and frozen activity cursor DTOs
├── insight-preferences.ts # Shared leaf preference schema for existing and new writing paths
├── effects.ts    # Immutable relation-owned adoption/promotion color deltas and body-free events plus v2 guidance/description and v3 nesting/group-placement effects for precise undo
├── history.ts    # Strict events, immutable period-end projections/activity and separate revision-bound live past-task pages
├── transfer.ts   # v1–v11 datasets, immutable capture/completion receipts and grouped inverses, guidance/nesting, backup/restore/reset confirmations and batch DTOs
├── smart-input.ts # Jev 服务、设备状态、六尺度周期 / child-only 起草 DTO、智能动作与修订回声
├── link-preview.ts # Strict public link preview/open actions and bounded inert metadata; lightweight syntax lives in ../links.ts
├── queries.ts    # Up to six selected periods, effective topology and hidden-parent context, generation-guarded reviewContext/pastPeriod pages with live closingParents, detail dependency guards/assisted notes, immutable history and counts
├── sync.ts       # Strict Apple/Google provider selection, authorization status, keep/clear sign-out, non-destructive recovery, exact destructive phrase and Realtime/upload-wait status
├── sync-review.ts # Bounded read-only task comparisons, pending group count and owned-value preview token
├── update.ts     # Fixed update actions (status/check/install), app version + updater phase DTO and About event names
├── window-close.ts # Token-bound native close requests and drain acknowledgements; no task content
└── runtime.ts    # Fixed preload API including bounded execution/activity/insight-context reads and getBoardPeriods/getReviewContext/getPastPeriod, smart input, device language/placement preferences, software updates, close-time draining and runtime diagnostics
```

Zod 在 main/worker 拒绝额外字段；preload 校验返回 DTO。renderer 只导入轻量 values 和类型，不构造 schema；构建门槛拒绝 renderer 引入 Zod。renderer 不能传入 SQL、路径、时钟或任意撤销字段。

[PROTOCOL]: Update this header when making changes, then check README.md.
