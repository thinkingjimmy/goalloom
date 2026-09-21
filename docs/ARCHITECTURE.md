# Goalloom · 技术架构与数据契约

v0.3 · 2026-09-21。**Electron 已由用户确认；本文仍是实现规格，无应用源码或平台实测。**

## 1. 技术路线与边界

| 层 | 当前路线 | 状态 |
| --- | --- | --- |
| 桌面壳 | Electron | Accepted，不并行实现 Tauri / QuickGUI |
| 界面 | React + TypeScript strict + shadcn/ui + Tailwind CSS | 保持用户指定 UI 体系；版本在 M1 锁定 [S3](SOURCES.md#s3) |
| 构建 | Vite；建议评估 electron-vite 的三入口方案 | 具体构建 / 打包工具待技术验证 [S24](SOURCES.md#s24) |
| 持久化 | SQLite，稳定应用数据目录 | 驱动在所选 Electron 运行时与两种安装包中验证 |
| 拖拽 | dnd-kit 候选 | 锁定兼容 major，不以浏览器成功代替桌面测试 [S16](SOURCES.md#s16) |
| 关系显示 | chips、定位、选中高亮，随后有限 SVG | 无无限画布；历史引用不接当前连线 |
| 历史 | 当前实体表 + 小型关键事件表 | 只服务历史 / 顺延 / 撤销，不重放整个应用 |
| 测试 | 纯规则、组件、repository、真实 Electron 和安装 | 所有承诺 OS / CPU 实测 |

Tauri 和 QuickGUI 的旧评估仅为决策背景，见 [FRAMEWORK_EVALUATION.md](FRAMEWORK_EVALUATION.md)。不是待完成的另一套架构。

## 2. Electron 进程与权限

```text
React / shadcn / Tailwind renderer
           ↓ window.goalloom 的有限 typed API
contextBridge / preload
           ↓ 经验证的 IPC
main 命令服务 → 单一 SQLite 写入通道
           ↓ 同事务：当前实体 + 关键事件 + 命令 / 批次结果
本地数据库、一致性备份、用户确认的导入导出
```

Electron 支持通过 preload 的 contextBridge 暴露隔离 API。仅开启隔离并不代表所有桥接都安全，应按业务逐个方法暴露，不能把原始 ipcRenderer 交给 renderer。[S31](SOURCES.md#s31)

实现要求：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；生产主窗口只加载本地资源，限制导航、新窗口、权限请求与外链协议。main 验证调用来源、参数、实体版本和返回 DTO；不给 renderer 任意 SQL、文件路径、shell 或通用 IPC 接口。[S22](SOURCES.md#s22)

SQLite 驱动只在 main / 受控存储 worker 使用。M1 对比所选 Electron 内嵌 Node 实际具备的 SQLite API与相容的原生驱动，验证事务和备份；不把宿主 Node 版本当作 Electron Node 版本。使用原生模块必须处理对应 Electron ABI、CPU 架构、重建及打包资源。[S23](SOURCES.md#s23)

短事务先走单一写入服务；大量导入、历史重建查询或压力测试若阻塞主进程，应转入专用存储 worker，但仍只保留一个权威写入通道。renderer sandbox 不因数据库报错被关闭。具体 worker / 打包工具在技术验证后记录，不同时搭两套运行时。

建议目录为 `src/main`、`src/preload`、`src/renderer`、`src/shared/contracts`、`src/main/domain`、`src/main/repository`、`src/main/migrations`、`tests`。前端不导入 main 的特权依赖。浏览器 MockRepository 必须提示不持久化；正式构建缺少真实存储则报错。

## 3. 数据模型

字段为实施草案，不是已执行迁移。单主位置不决定关联基数；D06 确认前不把多父或单父约束当作用户批准。

| 实体 | 关键字段 | 约束 / 用途 |
| --- | --- | --- |
| settings | timezone, week_start, cycle_anchor, version, rollover_paused_after_restore | 单工作区；恢复后自动处理暂停须持久化 |
| rollover_policies | horizon, mode, effective_from_period_id, version | day默认auto，week/month默认manual，cycle固定manual；无Later记录 |
| items | id, kind, title, description, status, color, due_date, completed_at, archived_at, deleted_at, version, created_at, updated_at | UUID；标题非空；当前状态与完成时间一致；所有实际修改增加version |
| planning_periods | id, kind, start_date, end_date_exclusive, timezone, start_at_utc, end_at_utc | 固定历史边界；自然周期key含起始日期及必要的时区 / 日历设置身份 |
| item_placements | item_id, horizon, period_id, sort_key, version, auto_hold_period_id | item_id唯一；auto_hold用于撤销后本周期不再自动顺延 |
| item_relations | id, parent_id, child_id, deleted_at, created_at | 活跃对唯一；禁止自关联与循环；基数待D06 |
| operations | id, kind, source, request_hash, occurred_at, result_json, undo_of_operation_id | commandId / batchId；请求去重与批次反馈，不存全文版本 |
| item_events | id, seq, operation_id, event_index, item_id, event_type, occurred_at, payload_version, before_json, after_json, undo_of_event_id | 追加式关键记录；id唯一；operation_id + event_index唯一；seq为稳定次序 |
| schema_migrations | version, applied_at | 事务成功后才提升版本 |

实体没有 progress_mode、manual_progress、rollup、weight、KR、账户、云同步队列或团队表。普通标签和完整周期快照后置。

每个未删除条目必须有且只有一个 placement。Later的period_id为空；其他horizon必须匹配period类型。创建条目、位置、初始关系与创建事件同事务。归档 / 软删除保留实体和历史身份，不级联物理删除事件。

`before_json` / `after_json` 只保存还原计划与状态所需的有限结构：horizon、periodId、sortKey / 原邻居、status、completedAt、archivedAt、deletedAt、itemVersion、placementVersion、autoHoldPeriodId。创建事件的before为空；baseline明确标出历史不完整。事件不是任意JSON转储；大小、字段与枚举需运行时校验。

历史内容默认读取当前title / description / relations，并在历史UI注明；不在事件里为每次文字修改复制全文，也不宣称标题版本可恢复。所有文字编辑仍增加item.version，供安全撤销冲突检查。

## 4. 关键事件与当前表并存

### 4.1 事件范围

`created`、`baseline`、`moved`、`rolled_over`、`status_changed`、`archived`、`unarchived`、`deleted`、`restored`、`rollover_undone`覆盖关键变化。status_changed包含完成、重开、取消；创建也记录首次计划。

同列排序只更新位置 / 版本，不写成移动或顺延事件；无需记录hover、输入按键或滚动。P0不追溯关系图和正文版本。关系操作仍原子执行并增加受影响项version，但不伪造当时完整图。

### 4.2 事务与重试

所有业务命令带稳定operationId与规范化请求摘要。同ID同请求返回已提交结果；同ID不同内容报冲突。事务依次：查重→校验→写当前实体→写事件→保存operation结果→提交。响应丢失后的重试不能再次写事件。

首版为单实例 / 单工作窗口，统一串行写入。用户操作使用expectedVersion；系统核对在写事务中重新读取真实状态，不使用过时前端列表。字段校验、关系防环和全图导入验证不能只在renderer中执行。

当前看板直接读取items与placements。历史读取item_events并按索引查询，不每次启动重放全库。建议索引：item_id + seq、operation_id + event_index；涉及的from/to periodId提取为受校验的列或索引，避免全文扫描JSON。确切DDL在首次迁移前定稿。

### 4.3 不变量

移动保持ID、内容、状态、截止日期和关系；拆解生成新ID。完成只更新自身和对应事件，不改变其他关联条目的状态或进度。界面引用可以反映同一实体的新标题 / 状态。

解除关系不删除实体；删除目标仅使其边失效，保留其他条目。恢复关系重新防环；有冲突时恢复实体而不恢复非法边，并提示。

排序可用间隔整数；耗尽时重排目标列并原子保存。撤销恢复相对邻居，不通过覆写整列旧排序破坏新安排。

## 5. 历史查询投影

### 5.1 范围与成员

`viewPeriod`仅是renderer状态。getPeriodHistory是只读命令；过去空周期可临时计算日期边界，不为翻页写数据库。P0禁止向未来或历史周期写计划。

成员为事件中曾明确关联到指定horizon / period的itemId，去重；不是包含该日期区间的所有其他尺度任务。同周期移出又移回只显示一条汇总，详情保留各次变化。

### 5.2 两类时间信息

针对历史period的固定end_at_utc，读取边界之前最后一条相关状态 / 位置 / 可见性事件，得到asOfEnd。再单独读取边界后事件，展示laterOutcome与currentState。

返回DTO建议包含itemId、periodId、historicalPlanOutcome、statusAtEnd、laterOutcome、currentPlacement、currentStatus、historyCompleteness；内容字段注明current。不能用当前items.status替代statusAtEnd。

9月安排、10月顺延并完成：9月末是todo；10月的后续完成不反写9月。9月完成10月重开：9月保持已完成。9月遗留10月直接完成但没有移入10月：全局完成列表归10月，不能制造10月计划成员。

存在baseline时，早于baseline的状态为unknown；不可用当前状态回填。应用未运行的期间不生成中间操作；如果此前事件完整且无后续变更，可展示最后已知本地状态，但不声称生成过实际期末快照。

事件seq决定同时间戳的写入次序。occurred_at为实际执行时间，period边界固定；检测系统时钟回拨时记录观测异常并标注受影响历史不确定，不重新排序或伪造时刻。

### 5.3 展示隔离

历史卡片只读，点击打开明确标注的当前实体详情。历史端点不进入当前SVG关系图。历史页的标签 / 标题可以是当前信息，但必须声明不提供完整历史内容与关联版本。精确历史排序、月报评分、不可变全量快照不在P0。

## 6. 周期与自动顺延服务

### 6.1 日历服务

使用工作区日历日期，UTC记录操作。自然周key不能只有W38。三个月边界从原始锚点按+3n日历月计算，月底截断不逐轮漂移。已结束period存固定边界；改时区 / 周起始日先预览，不能重算历史。

启动、唤醒、获得焦点、日历边界统一调用reconcilePeriods。关闭应用时无常驻后台操作；同一轮只用一个observedAt和对应当前周期，事务提交后再检测下一边界。

### 6.2 候选过滤与策略

候选需同时满足：todo、未归档 / 删除、所在period已结束、horizon策略为auto、来源period不早于该策略effective_from_period、没有指向本目标period的auto_hold，且没有恢复后的暂停状态。

只允许day / week / month自动；cycle为manual，Later不参与。默认day=auto，其余manual。首次启用时effective_from指向当前源周期；旧积压不被这次设置追溯处理。

未自动处理的有效旧待办，通过查询派生“往期未完成”；无独立重复任务。只匹配唯一placement的horizon，不传播到关系上下级。

### 6.3 原子批次

锁定写通道后重新读取候选；按目标周期组成批次，更新位置、稳定追加排序、记录每项rolled_over事件及operation结果，再提交。目标已有任务顺序保持；批次内部按来源周期近到远及原排序。

成功后发送batchId / movedCount / sources通知。失败全回滚，无成功提示。重复核对时已移动项不再是候选；operationId负责响应重试去重。不得以“今天运行过”全局标志跳过后来产生的真正候选。

9月关闭到11月：实际只执行一次9月→11月，保留实际observedAt；不建立虚假的10月经过事件。

### 6.4 分类

同horizon且目标period晚于来源为rolled_over；跨horizon或移回Later为moved；同period排序不算顺延。undo是明确的反向事件。事件中保存真实跨度，不能按相差月份自动加虚假延期次数。

### 6.5 批次撤销

undoRollover(batchId)先生成可撤销预览；执行时在同一写事务中逐项复核item.version与placement.version等是否仍等于原事件after，且仍处原目标位置。改变过的项跳过并说明，符合者恢复原位置 / 相对排序；不恢复标题或全实体旧快照。

新增反向事件引用undo_of_event_id，并保存undo operation结果。设置placement.auto_hold_period_id为撤销执行时该horizon的真实当前周期（即使原批次来自更早周期），防重启后立即自动移回；下一目标周期不再匹配此抑制。手动移动清除hold。

对同一事件至多成功撤销一次，数据库约束或同事务检查保证。若全部冲突返回0条及原因，不伪称撤销成功。已被后续另一次顺延的项也跳过。

## 7. 导出、备份、恢复

SQLite在稳定应用数据目录，启用外键、journal / busy timeout和显式事务。备份选驱动支持的一致性方式；SQLite官方Online Backup API用于获取一致性副本，不把随意复制活跃主文件当作备份。[S12](SOURCES.md#s12)

JSON包含schemaVersion、exportedAt、settings、policies、items、periods、placements、relations、operations、events；保留事件ID / 时间 / 顺序与undo引用、策略生效边界和撤销抑制。去重记录不是遥测，只留在本地与用户导出文件。

恢复流程：大小限制→版本 / 字段 / 日期 / 图 / 事件链校验→影响预览→明确确认→一致性备份→原子替换→完整性校验。未知schema、悬空事件、重复placement / event、循环关系或不一致状态链均拒绝；失败保留原数据。

恢复成功设置rollover_paused_after_restore=true，先让用户看结果；确认“继续按设置处理”才解除暂停并补处理。不借下次启动绕过确认。首次无历史旧数据以实际迁移 / 导入时间创建baseline并标明历史起点，不从旧created_at伪造事件。

P0没有已发布旧应用版本；本节定义未来兼容原则，不声称存在从真实v0.2应用迁移的脚本。文档v0.3不是数据库schema版本号。

## 8. 测试与双平台交付

M1先完成两列Electron真实应用：中文编辑、拖动、关联弹窗、受控IPC、SQLite保存 / 重启、导出恢复及macOS / Windows安装。原生驱动需在打包后加载成功；不要只测宿主Node。[S23](SOURCES.md#s23)

| 层 | 重点 |
| --- | --- |
| 纯规则 | 周期边界、事件分类、历史as-of、默认策略 / 生效边界、单位置、关系防环 |
| UI | 中文IME、键盘、拖动、按列翻页、历史只读、批量遗留操作、顺延通知 |
| Repository | 当前表 / 事件原子写入、去重、并发、冲突撤销、备份恢复、错误注入 |
| 真实Electron | preload / main权限、SQLite运行时、唤醒 / 跨日、关闭 / 退出 / 重开 |
| 安装与负载 | 各承诺架构、中文路径、升级、1,000活跃 / 10,000总条目及相应事件量 |

桌面自动化工具在M1验证，不将浏览器mock当原生输入或安装验收。支持OS / CPU范围由用户确认并实测；当前建议先验证Apple Silicon与Windows x64，未默认承诺Intel Mac / Windows ARM64。

正式分发的代码签名、公证、下载后安装行为仍须落实，私人内测与公开发布分开。[S29](SOURCES.md#s29) 所有验收当前未执行。

## 9. 安全、隐私与复杂度控制

用户文本不执行脚本；外链验证协议后交系统浏览器。renderer不能任意读取历史数据库、调用SQL或获得shell权限；只使用业务查询 / 命令。

私人任务与历史均是敏感本地数据，不进入开发日志 / 遥测；导出和备份同样可能含私人内容。SQLite默认不等于应用层加密，不声称端到端加密。不开云服务，不嵌入私人repo token，不公开参考图或安装包。

不构建CRDT、完整事件溯源、全字段版本仓库、分布式消息队列、目标聚合器或多后端抽象平台。只增加为真实历史和安全撤销必需的小型记录与事务约束。
