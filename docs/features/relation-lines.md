# 关系线与流程圆点

> 筛选单个流程时，用线把它的上下级连起来；悬停圆点可预览流程，点击可改色或改上级，也可从加号／圆点拖出连线关联上级。「设置 → 外观 → 关系线」只控制展示，本机偏好，默认开。

## 产品规则

### 关联周期规则（2026-09-24 所有者确认）

- Later 是暂存区，不是计划周期：Later 条目不参与关联和流程，不显示流程圆点，不能设流程色。
- 新建关联（关联上级、带上级新建、计划/拆解）要求上级在**周期严格更长**的计划列：年 → 半年 → 3个月 → 本月 → 本周 → 今天。同列、反向和任一端在 Later 都拒绝，且不写入。
- 详情「拆解下一步」把下级建到下一列；今天已是最短周期，与 Later 一样不提供拆解。
- 只约束新建：顺延、撤销、还原、导入，以及不是「移入 Later」的移动，都保留已有关联。移入 Later 在同一事务里解除该条目的上级，撤销这次移动时一起恢复；它留下的下级，以及反向或跨 Later 的旧线，照常显示，可在选择器里解除。
- 选择器只列周期合规的候选（已关联的始终列出以便解除），最近的一列排前；开启[按上级自动排序](board-ordering.md)时，同列候选跟随看板顺序。详情与看板圆点共用同一选择器。
- 关联两个已有条目时，至少一端已有流程归属；两端均无流程色且没有继承流程时禁止新建关联。上级／下级选择器（含搜索）、拖拽与权威 `link` 事务遵守同一规则。按实际祖先流程判断，不以条目自身 `flowColor` 是否为空判断；已有关联始终允许解除，移动、撤销、还原和导入仍保留旧关系。

### 流程圆点

- 悬停或键盘聚焦一行，复选框前出现圆点，包在行底色之内；悬停圆点时是紧贴圆点的圆形光晕，不另起一块底色。流程中的行在画线时常显圆点；顶栏筛选单个流程时，年列的待办行默认隐藏圆点，悬停行、键盘聚焦圆点或打开圆点菜单／任务右键菜单时仍显示，复选框位置不变。「全部」下的悬停预览、其他列和已完成行保持原有规则。
- 圆点菜单按条目身份区分：
  - **流程起点**（有流程色、无上级）：点开 4×2 流程色板，改色或「不设流程」；提示写明影响范围（「影响它和下面 N 项」「不设流程（共 N 项）」）。有更长周期时也提供「关联到上级」，与拖拽共用原子合并。
  - **下级**（有上级）：点开「上级」选择器，勾选/取消上级；所属流程与颜色随关联自动变化，这里不出现色板。
  - **独立条目**（无上级、无流程色）：虚线点，悬停变「+」；点开二选一：「设为流程起点」（选色）或「关联到上级」。年列没有更长的上级，后者置灰并说明。菜单按内容自适应宽度，最多 480px 且不超过窗口可用宽度；说明自然换行，避免固定窄宽造成孤字折行。
- 属于两条流程时圆点斜切双色；三条及以上显示流程数。行首圆点与尾部接点直径统一为 6px，悬停保持大小、仅显示光晕；行首按钮仍保留 18px 点击区域。
- 圆点面板默认向下展开；下方空间不足时向上展开并留在窗口内。从二选一切换到上级选择器或色板、搜索结果改变高度时，立即按实际尺寸重新定位；滚动与窗口缩放时继续贴合圆点。
- 悬停流程圆点不弹出文字提示；所属流程和拖拽说明保留在无障碍名称／描述与点击后的菜单中。
- 改色、添加关联与解除关联都走现有命令，成功后以圆点、列表和连线变化反馈，不显示成功 Toast。关联仍进入现有会话撤销栈，快捷键／命令面板撤销有明确反馈；单独改色不进入全局撤销栈，合并流程时的清色随关联一同撤销。具体反馈规则见 [完成反馈与撒花](completion-feedback.md)。

### 拖拽关联（2026-09-29 所有者确认）

- 左键按住加号或任意流程圆点，移动超过 6px 立即拖出连线；阈值内保持点击菜单，拖拽结束不追加点击操作。鼠标关联与任务位置拖动独立。
- 可落在当前／已加载未来周期的可见任务整行，包括已展开完成项；按视口裁切命中。拖动中不显示文字提示：无效行（同列、更短周期、Later、自身、已有上级及会成环）淡出，有效行右端显示空心接点。连线与关系线同构（直角、圆角、沿列分隔线走线），未吸附时为灰色点线并跟随指针；吸附后以上级流程色实线落到目标接点，目标整行铺上级流程淡色（无流程色时用焦点色），不再使用箭头或描边。落空与无效目标不写入、不解除旧关联。
- 源行在虚拟列表外仍保留；支持目标列纵向和时间看板横向边缘自动滚动。Esc、指针取消、失焦／隐藏、换期、维护／写入阻塞、工作区替换取消手势。松手重新验证端点身份／位置和工作区代次。
- 流程起点可直接并入上级：吸附时源行末显示「原色点 → 新色点」小标记，不另弹确认；菜单入口保留文字说明。已有流程的上级沿用原子合并；无色、无上级、无其他活跃分支的独立上级则承接原颜色，成为新的流程起点。后者保留原有下级的颜色、状态和位置，筛选跟随同色的新起点；预览也保留原颜色。无色但已有其他关联的上级不转移颜色，仍按原规则跟随上级。颜色变化与新边在同一事务提交，撤销一次恢复旧起点与原关系。
- 一次撤销同时解除新增边并恢复原色，保留后续正文修改；颜色被占用、改色、新增其他上级等依赖冲突时整笔不修改业务数据。单独改色仍不入撤销栈。
- 临时连线不受关系线开关影响；结束后回归现有展示策略。成功无 Toast，读屏播报关联结果，失败沿用可见错误及原回执重试。键盘可通过原菜单完成关联／流程合并，菜单提示覆盖五语言。

### 行与列

- 时间列等分宽度、至少 320px；[Later 固定侧栏](later-sidebar.md)与时间列同宽。时间列复选框离列左竖线 23px（流程圆点占满其前方留白）。Later 没有圆点，行首留 12px，列标题与复选框对齐。行底色离左右两侧竖线各 3px。滚动条贴近列的右侧分隔线，仅鼠标悬停该列（含列头）时显示，移出即隐藏，保留的任务焦点不使其常显；内容宽度、换行及行对齐保持不变。
- 看板任务标题完整换行显示，不限制行数、不以省略号截断，普通文本与链接标题一致；行高随内容增长。仅首行避让复选框，续行回到复选框左缘并与预览卡片对齐；复选框保持独立点击。圆点、复选框、日期/图标与连线接点都对齐第一行。
- Trailing relation ports and next-step rings/pills overlay the row content. Titles and URL cards retain only the standard 6px right inset; showing or hiding these controls never reserves extra width or changes wrapping, even when they cover text.
- 任务标题悬停不重复弹出标题文字，普通任务、含链接任务及往期列表一致；点击与键盘打开详情沿用原有行为。
- 单行行高 32px（相邻待办的纵向间距比原来缩小 20%），标题字号 14px、多行文字行距 22px；普通、已完成和往期任务共用紧凑间距。行间不画分隔线；行底色上下各留 2px，相邻两行的悬停/定位/流程底色之间的 4px 空隙就是唯一的分隔。

### 连线与底色

- 顶栏选中某一个流程时常驻画线；在「全部」下悬停或键盘聚焦有色圆点，临时画出该条目所属流程的线（跨两条流程时两条都画，各用自己的颜色），鼠标或键盘焦点移到流程内任务及其末尾 ＋ 时保持预览，离开这些区域 120ms 后收起，不播放画入动画。预览中，高亮链里每个无下级待办都提供添加入口，淡化的旁支不出 ＋；与连线共用祖先／后代范围，遵循[流程洞察](flow-insight.md)的周期与任务状态规则。
- 画线时，属于这些流程的行铺上流程浅色底（不透明，与背景 65% 混合），悬停该行或其圆点时加深；链外同流程行回到背景色，其余行置灰（内容 28%）。关闭关系线开关时，筛选仍置灰，但不画线、不铺底色、悬停圆点不预览。
- 线只连两端共享同一活跃流程的上下级；跨流程的上级不画，只在详情里看到。线只读，不改数据、不进撤销栈。
- 样式：流程色、1.5px、60% 不透明的圆角直角线（转角半径 5px）。上级从行尾接点出（6px，与行首圆点对称：离行右边缘 9px，落在行底色内），在列间留白里贴着竖线（离行边 6px）上下走，再横向进入下级，停在它的流程圆点左边缘；同列上下级从右侧留白绕回，反向的线走左侧留白。画线时行宽不变；线层在行之上，但只经过列间留白和行间空隙，不压文字。
- 跨过中间列（按固定时间列顺序判断）用虚线：先在上级一侧的留白里走到中间列最近的行间空隙，沿空隙横穿，再在下级一侧的留白里转入。
- 多个上级各一条线，等重汇到同一入口圆点。
- 悬停或键盘聚焦本流程的某项：它的全部祖先与后代链 100%、2px，其余线 12%；圆点预览时以该条目为链心。
- 端点滚出本列视野：线停在列顶/列底，挂「↑/↓ N」标记（读屏：「上方还有 N 项相关」）；点击滚动到最近的那一项。未挂载的行（折叠的已完成、虚拟窗口外、历史模式列）不画线。已完成项展开时线降到 30%。
- 切换筛选流程时线按列依次画出（每条 500ms，列间 70ms）；减少动态效果时直接显示。拖动任务位置时线与圆点隐藏，放下后的重排过程中跟随卡片位置；拖拽关联时保留源点并淡化已有线。[按上级自动排序](board-ordering.md)的连续重排也保持贴合。
- 顶栏不放任何关系线入口。

## 工程契约

- Flow-choice failure cases (2026-10-03): an unexplained trailing ellipsis remains in any locale; a fixed width leaves an orphaned final character, intrinsic sizing pushes the panel outside the window, or the parent-disabled explanation overflows.
- Flow-link policy failure cases: two colorless endpoints appear in parent/child search or link through dragging/IPC; an inherited flow is mistaken for no flow; old colorless links cannot be removed. Root promotion loses its color, recolors an unrelated branch, previews a different result, drops the selected filter, partially commits or duplicates on retry. Undo overwrites text or later branches/colors, fails to restore both roots atomically, or promotion effects fail JSON/SQLite restore or accept a forged transfer target. Record these cases before extending the existing desktop relation fixtures.

### 拖拽关联：实现前失败场景

- 点击被误判为拖拽，放下后又打开菜单、任务详情或外部链接；关联拖拽意外移动任务。
- 命中被裁切、未挂载、Later、往期或不可写的行；同列、反向、重复、自关联或环绕过校验。
- 滚动后连线错位，源行被虚拟列表卸载，窄窗口无法到达目标；取消后仍遗留连线、捕获、滚动或高亮。
- 失焦、隐藏、换期、工作区替换后旧手势仍提交；端点已移动、删除或改变流程身份却使用旧提示提交。
- 流程起点只清色未连边，失败或重试重复执行；原有下级、上级、状态或正文被意外修改。
- 合并撤销只撤回一半；颜色被占用、新增上级或颜色改变时覆盖后来修改；普通改色意外进入撤销栈。
- 新效果无法通过 JSON／SQLite 备份恢复；恶意导入把颜色效果放进普通解除关联或改到其他端点。
- 关系线开关关闭后无法拖拽、筛选淡化遮住候选、无色上级缺少反馈、键盘缺少同等的流程合并入口、五语言漏译。

- `src/domain/relations.ts`：`mayParent(parent, child)` / `horizonProblem(parent, child)` 是新建关联的周期规则，`link`、`create`（带上级）与 `createPlan` 在权威事务内复核；`create`/`createPlan`/`flowColor` 拒绝 Later 流程色。renderer 的选择器、QuickAdd 与 composer 草稿复用 `mayParent` 做同一过滤。DAG/防环校验不变，撤销、还原和导入不套用周期规则。`moveItem` 在进入 Later 时于同一操作解除上级（`move` / `arrangeBacklog` 可以带上这条 `relations` 效果），撤销该次移动时恢复；下级边和其他移动不解除。
- `src/renderer/state/relation-lines.ts`：`useRelationLines` 外部存储，localStorage `goalloom.relationLines`，只在关闭时存 `'false'`；不进入工作区数据、历史、导出或备份。
- `src/renderer/features/board/Board.tsx`：持有圆点预览（120ms 离开缓冲），活跃流程 = 预览条目的流程，否则为筛选流程；据此给时间列的行 `dimmed` 与 `tint`（`flowTint`；Later 不参与流程，筛选时保持原样、不置灰），并在「活跃 + 开关开」时挂载关系线（键为 `lines:<flow id>` 或 `lines:preview`，仅筛选时画入）。断点层使用独立的 `breakpoints:<workspace generation>` 键，接收同一活跃流程集合；跨悬停进出保留待处理操作，工作区替换时清空。Board 统一管理圆点预览的指针／焦点离开，允许跨正文访问末尾添加按钮。`data-filtered` 区分顶栏筛选与临时预览，供 CSS 控制年列待办圆点的静止态显示。
- `src/renderer/features/board/FlowDot.tsx`：行内圆点与浮层（`Popover floating` 经 portal 浮出列滚动区），复用 `FlowColorMenu` 与 `RelationPicker`；指针悬停与键盘 `:focus-visible` 触发预览，鼠标点击的焦点不触发。
- `RelationDrag.tsx`：独立鼠标状态、虚拟源行保留、可视命中与自动滚动；逐帧更新只通知 SVG 浮层。菜单与拖拽复用 `PreparedWrite` 重读版本和提交，`relation-drag.css` 提供交互层样式。
- `link.adoptParentFlow?: true`：只有显式启用才能调整源流程色。`mayLinkFlows` 用实际流程归属过滤两个已有条目，事务通过祖先查询复核；`promotedFlowColor` 仅对没有活跃关联的无色上级返回源颜色。先清源色，再写上级颜色／新边，保持触发器与颜色唯一性。同一 `relations` 效果可带 `flowColor: { before, after: null, transferredTo? }`；转移目标必须是该新边的上级。撤销复核两端颜色、其他上级和新增分支；JSON／SQLite 导入校验效果归属，普通关系效果不带该字段。
- `src/renderer/components/Popover.tsx`：floating 浮层用 `ResizeObserver` 监听面板与锚点尺寸；模式切换和异步搜索改变内容后重算方向与横向边界，沿用 6px 锚点间距和 8px 窗口留白。关闭或卸载时释放观察与监听，位置未变时不重复更新。
- `src/renderer/state/flows.ts`：`activeFlowGraph` 根据看板条目、快照关联与活跃流程归属投影共用图；`flowChain` 从焦点分别向祖先和后代遍历，不从祖先扩散到旁支。Board 将同一图提供给关系线，并将预览链提供给断点层。
- `src/renderer/features/board/RelationLines.tsx`：使用 Board 提供的共用流程图与 `flowChain`，按边的共享流程着色；几何读取已挂载行的 DOM 位置，经 MutationObserver（忽略自身）、ResizeObserver、捕获阶段 scroll 与 transitionend 以 rAF 合并重算。共享 `RowMotion` 的有限动效帧信号直接更新路径和标记，结束即停止；React 提交后在布局阶段校准首帧。锚点取行首行（顶部 32px）的中线；路径由 `orthogonal()` 生成（经列间留白的竖直走线、圆角转折）；向前的边终点在下级流程圆点左边缘（行左边缘内 8px）且不画端点；线层 `z-index` 在行之上；链高亮通过行上的 `data-chain-out`，活跃流程变化或卸载时清除。
- 样式在 `styles.css` 的 Relation lines 与 Flow dot 段：`.column-content` 延伸到右侧列边界，以等量右内边距补偿保持内容宽度，行左内边距容纳行首圆点，右内边距为 6px，尾部接点与断点入口悬浮覆盖内容；行用透明上下边框 + `background-clip: padding-box` 留出 2px 空隙，行间无分隔线；`data-dimmed` / `data-chain-out` 只淡化行内容（不含拖动柄），`data-lit` + `--row-tint` 铺流程底色。

## 验收

- [x] 两个已有无流程条目不出现在彼此的新关联候选中，搜索／拖拽／事务同样拒绝；继承流程的条目可关联，旧无色关系可解除和撤销。独立无色上级承接原起点颜色、筛选与下级；一次撤销恢复两端，后续正文保留，新增分支／改色冲突不部分回退。原生窗口与权威事务、JSON／SQLite 恢复证据：`output/tests/relation-drag/acceptance.json`、`report.json`、`transactions.json` 和 `flow-root-promotion-*.png`。

- [x] Flow choices use content width with a viewport cap; Chinese explanations have no orphaned final character and all five parent-action labels omit the ellipsis. Existing root adoption and parent picking still work. Measured geometry: `output/tests/flow-dot-position.json` and five-locale screenshots `output/tests/screenshots/language-flow-choice-*.png`.

- [x] 拖拽关联：`pnpm test:relations` 包含独立 `relation-drag.mjs`；开发可单跑 `node tests/desktop/relation-drag.mjs`。真实指针、原子事务／撤销／导入、原回执恢复、自动排序、当前未来、完成项、长列、窄窗、取消、五语言和主题证据位于 `output/tests/relation-drag/`。原生隐藏通过无前台模拟的独立 Electron 验证。

- [x] `pnpm run test:relations`（`tests/desktop/relations.mjs`）：
  - 周期规则：Later 端点、同列、反向关联与 Later 设流程色均被拒绝且不写入。
  - 筛选：3个月 → 今天一个流程（含两个上级、本月 → 今天跨级、已完成叶子）画 7 条线、1 条虚线；其他流程与无流程的 5 行原位置灰；本流程 7 行铺流程底色；画线时行宽不变、底色不透明。
  - 行与列：普通文本和链接长标题完整换行，行高随内容增长；复选框与连线接点对齐第一行；列宽 ≥ 320px，行底色离两侧竖线各 3px；相邻底色间留 4px，行间无分隔线。
  - 悬停两上级项 6 条高亮 1 条淡化、1 行链外；键盘聚焦同样高亮；本周滚动后出现「上方还有 2 项相关」并点击定位。
  - 流程圆点：筛选时 3个月待办圆点默认隐藏，悬停/键盘聚焦/菜单打开时显示且复选框不移位，其他列圆点仍常显；Later 无圆点；「全部」下悬停下级圆点预览连线与底色，3个月圆点仍常显；起点圆点色板写明「影响它和下面 7 项」「不设流程（共 8 项）」；下级圆点只列周期更长的候选、取消上级后撤销恢复；独立条目「加入流程」二选一并关联上级、撤销恢复。
  - 设置外观开关关闭后不画线、行宽不变、存储为 `false`、刷新后保持，顶栏无入口。
  - 截图 `output/tests/screenshots/relation-lines*.png`、`flow-dot-*.png`、`settings-relation-lines.png`。首尾 6px 圆点、18px 点击区和静止／悬停时的连线贴合尺寸保存在 `output/tests/relation-endpoints.json`。
- [x] `pnpm test`：`tests/integration` 覆盖 `link`、带上级新建、`flowColor` 与 `createPlan` 的周期规则及拒绝不写入；`tests/renderer/draft.test.ts` 覆盖 composer 本地复核。
- [ ] 反馈优化：添加与解除关联成功后无底部 Toast；快捷键／命令面板撤销仍恢复原关联并显示撤销反馈，流程色改动保持静默。
- [x] 浮层定位：`pnpm test:relations` 覆盖底部短菜单切换上级／色板、搜索收缩后恢复候选、已关联圆点直接打开、滚动与窗口缩放；尺寸报告 `output/tests/flow-dot-position.json`，截图 `output/tests/screenshots/flow-dot-position-*.png`。
- [ ] Windows 11 上显示与性能由所有者人工验收。

[PROTOCOL]: Update this header when making changes, then check README.md.
