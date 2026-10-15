# 按上级自动放置与单次整理

> 设置 → 工作区 → 看板：新增或更换有效上级时自动放置当前任务；列菜单的「按上级整理」只整理一次。

## 产品规则

- 单一本机开关，默认关闭，不进入备份或导出。「完成撒花」迁入同页，保持七列选择、预览与本机偏好。
- 最近一级有效上级优先；同尺度多个上级取排最前者，仅作为排序依据，不改变多父关系。不同尺度先近后远，同尺度跨周期按起点；最后按手动排序键与 ID 稳定排列。无有效上级的条目排最后。
- Owner decision, 2026-10-15, superseding continuous grouped sorting: automatic placement changes only a newly created task or a task whose effective ordering parent changes. It never reorders other tasks. Pointer/keyboard sorting is free across goal-parent groups and persists across reload. Explicit insertion/drop positions take priority and do not change goal links. Nesting keeps its two-level container behavior.
- 新建任务放到同一有效上级的最后一条任务之后；无上级放列尾。首次出现的上级按现有上级优先级选落点。同组任务即使已被手动分散，也不移动其他任务。
- 关联变化只有在有效排序上级变化时才移动当前任务；新增次要上级不覆盖手动位置。解除最后一个上级后放列尾。关联修改与自动移位同事务、同回执、同一次撤销。已有父子 todo 作为一个整体放置。
- 「按上级自动放置」只控制此后新建和关联变化，不在开关切换、刷新、重启、编辑正文、状态变化或上级手排时重排已有任务。半年、3个月、月、周、日及其未来周期适用；Later、年和过去周期不自动放置。
- 当前／未来列菜单的「按上级整理」将该周期的当前列一次性按上级排序；不整理其他列、其他周期或自动关闭放置开关。保留父子结构、关系、正文及生命周期，可一次撤销。Later、年和过去周期不显示此动作。
- [二级 todo](subtasks.md)先排列一级任务组，再排列组内子项；组的展示区由可见成员状态决定。合法的中部嵌套目标按层级规则校验。
- 看板圆点和详情中的关联选择器同步使用看板候选顺序，保留已绑定置顶与最近一级优先；搜索命中的当前／已加载未来候选同样跟随。
- Later、年和历史不自动排序；历史上级使用保存顺序。失效边及移动后不再满足上长下短的边不参与。
- 看板和关联候选使用持久化的手动顺序；上级拓扑只用于自动放置和单次整理。隐藏或归档上级仍可作为排序依据，不强制级联调整下级列。
- 重排保持行身份、焦点、草稿与滚动位置，约 240 ms 位移，关系线与断点同步跟随。首次加载／换期不播放，减少动态效果时直接定位。
- 拖拽浮动卡片保留完整原始标题，长 URL 和连续字符在卡片宽度内自动换行，卡片随文字增高。鼠标与键盘拖拽共用该规则，取消拖拽不修改任务。

## 工程契约

- 纯排序函数用于权威放置／整理事务，时钟由调用方注入。Renderer 直接展示持久化顺序。摘要仅补充相关祖先的 ID、位置、周期与排序键，无正文。
- `create` / `createPlan` / `link` / `unlink` 的 `autoPlace` 由提交时的本机偏好决定，在权威事务中计算落点；显式 `create.beforeId` 优先。新增只记录创建效果，关联变化记录该任务的位置效果和关系效果。未知结果保留原请求及偏好值，先查回执。
- `materializeParentOrder` 必须指定列和当前／未来周期，事务内复核时间并保存顺序；不改变其他列、状态、关系、周期或 hold。持久化位置沿用现有同步操作和撤销，不新增持续派生排序。
- 外层 FLIP／WAAPI 与内层 dnd-kit 分工；仅暂留前后可见窗口，动效可打断且无闲置逐帧任务。工作区代次变化清理缓存与待完成动作。

## 实现前失败场景

- Enabling/disabling placement or reloading reorders existing tasks; cross-group pointer/keyboard drops snap back or change goal links.
- Creating/linking moves unrelated tasks, a secondary parent resets manual position, explicit insertion loses to automatic placement, or a plan reorders old tasks.
- Relation and position changes commit/undo separately; retries duplicate moves; a failed write leaves half-applied positions/relations; undo overwrites later text edits.
- JSON/SQLite import rejects a valid combined relation/placement receipt, accepts a foreign task or cross-period placement effect, or permits partial undo of the combined operation.
- One-shot sorting touches another column/period, accepts a closed/stale period, splits nested tasks, changes lifecycle/relations or leaves the setting disabled.
- One-shot sorting replaces mounted row identities or loses the initiating column control's focus after the guarded write settles.
- Native acceptance covers manual drops, usable middle-row nesting, five-language settings/column actions, preference persistence, scoped sort/undo and receipt recovery. Transaction acceptance covers create/plan/link/unlink, explicit positions, effective-parent selection, rollback, replay, sync actions and current/future/history scope.

- 多父随机选择、上级手动顺序失效、跨级／跨期顺序不稳定，或隐藏／归档上级丢失。
- 手动落点与持久化顺序不一致、跨列丢失关联，或错误邻居／旧版本／旧代次绕过事务复核。
- 开关切换重排已有任务、单次整理跨列／跨周期写入、部分成功、重复写入或撤销破坏正文与 hold。
- 当前快照混入旧未来元数据、未知回执重复写入，或恢复后旧请求污染新工作区。
- 行重挂载、动画打断闪跳、拖放回弹、连线漂移、虚拟列表无限挂载，焦点／草稿／滚动丢失。
- Row-edge drops nest accidentally, the second task cannot move below the third, or the saved order differs from the insertion line. Cover both directions, unchanged slots, the last row, cancellation and undo in both ordering modes with `pnpm test:ordering --edge-sorting`.
- 拖拽浮层中的长 URL 或无空格标题横向溢出、被截断，或换行后的末行超出卡片；鼠标／键盘取消拖拽意外写入。真实 Electron 的行边界记录在 `output/tests/ordering/report.json` 的 `dragTitles`，截图为 `drag-title-*.png`。
- 看板已经手动排序，关联上级选择器却仍按旧序列出候选，或搜索后丢失看板顺序。
- 开关重启丢失、开关切换写入任务、撒花入口失效、缺少翻译，或减少动态效果仍播放。

## 验收

- [x] 真实 Electron 排序、拖动、当前／未来、生命周期、撤销、重启、恢复及失败边界；看板与详情的上级选择器和搜索同步排序。
- [x] 动效中间帧、连续打断、连线／断点几何、虚拟长列表与减少动态效果；私有截图、录像和 JSON 环境报告保存在 `output/tests/ordering/`。
- [x] 类型检查、全部现有 Vitest、构建和受影响模块桌面回归；不运行完整发布套件。
- [ ] Windows 11 由所有者人工验收；源码 Electron 不代表安装包验收。

[PROTOCOL]: Update this header when making changes, then check README.md.
