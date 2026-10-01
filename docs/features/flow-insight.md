# 流程洞察：断点、空列、复盘与右键菜单

> 顶部筛选与圆点预览都能在断链处给 ＋，一键补下一步；空列给一张起草卡；周期末在列头提供周/月复盘；待办右键菜单分组；设置 › 洞察可自定义起草与复盘的偏好。设计稿：Design 画布「目标聚焦 Insight 方案」（负责人 2026-09-27 确认）。

## 产品规则

### 断点 ＋（流程筛选与圆点预览）

- 「全部」静止时不出 ＋；筛选某条流程时，本流程中「当前周期、未完成、未归档」的条目，若在当前周期没有任何活跃下级，在它行内右侧（离行边缘 6px，对齐首行中线）出一个流程色入口：静止时是 16px 细圈，悬停该行、键盘聚焦、首次引导或起草中时展开为「＋ 下一步」胶囊。入口始终在行底色内、不越过列分隔线，不遮挡沿分隔线走的连线总线。只提示最近一级：本周还没有下级时，今天列不为它出 ＋。Later 与今天列条目不出 ＋；目标列整列为空时不出逐项 ＋，由空列卡代替。
- 悬停或键盘聚焦有色流程圆点时，高亮链中每个缺少下级的待办末尾都显示同款 ＋；高亮范围包含该条目及其祖先、后代，淡化的旁支不显示。切换圆点时按钮跟随高亮链切换。下一列为空时仍可添加；源条目与目标周期必须是当期，Later 与今天条目不出 ＋。多流程归属只显示一个按钮，预览中的跳级 ＋ 也只属于高亮链内的任务。鼠标或焦点经过流程内任务及 ＋／引导时保持预览，离开后按原有 120ms 缓冲收起；纯悬停普通任务不启动预览。
- 跳级：本流程中直接挂在「本月」下的「今天」条目（跨过本周）按同一上级分组，在该月计划行内右侧出一个橙色入口（与断点同样的细圈／「＋ 补一级」胶囊，位于已连接端口左侧、不覆盖端口；跨列虚线本身不变）。
- 单击 ＋：由模型起草一条标题并直接创建，与普通待办无异，不二次确认、无 Toast；上级已关联，目标周期为下一列的当前周期；若当前周（或月）今天结束，则写入下一周期，＋ 变为「下周 · 标题 →」去向标记，点击跳转查看。
- 单击跳级 ＋：起草一个本周里程碑并在一个事务内创建，今天的这几项改挂到它下面（解除与月计划的直接关联），一次撤销完整还原。
- ⇧ 单击，或未连接可用的模型：打开全局新建窗口（⌘N），只预填上级与周期，其余与平常新建一致；跳级另预填「下级：今天 N 项」。
- 首次出现断点时给一次引导（第一个 ＋ 加重 + 说明卡），点「知道了」或点任一 ＋ 后不再出现；引导状态只存本机。

### 空列

- 某一计划列在当前周期整列为空、且它的上一列有未完成条目时，列内显示一张卡：「本周还是空的」「为 N 项各起一步」「自己写」。不出逐项 ＋。
- 「为 N 项各起一步」打开新建窗口的多条草稿（最多 8 条），每条带上级，可取消勾选，↵ 一次写入；「自己写」打开只预填周期的新建窗口。有待复盘月份时，本月列由统一复盘引导卡替代空列卡。

### 复盘

- 2026-10-01 确认的月复盘设计：本月列把复盘、往期未完成和空列提示合并成一张引导卡，唯一主按钮开始／继续复盘；不显示「回顾进展 · 处理未完成 · 安排本月」及「为重要的方向，留出一点空间」。抽屉按明确的实际周期回顾 → 处理未完成 → 安排目标周期；关闭后本次会话保留步骤、选择和已编辑草稿。
- 2026-10-01 确认采用「简报」预览：复盘小结去掉大块底色，带图标的标题在前、AI 正文随后、三项统计在末尾同行排列并可换行；没有可用模型时也保留图标标题和统计。看板入口标题与 todo 同为 14px / 22px，内边距 12px，使用内容宽度的紧凑主按钮。抽屉底部「稍后／上一步」使用文字按钮，保留悬停和键盘焦点反馈。
- 步骤之间以细线连接；下方目标行整行提供悬停和键盘聚焦反馈，方框与箭头对齐标题首行，完成数量位于标题下方。
- 已结束周期的统计、目标记录与模型输入统一来自该周期截止时的历史投影；标题和说明使用当前文本，状态与位置使用截止时状态。回顾不使用本月空看板替代上月，也不将本月后来完成／顺延的状态倒填历史。无法可靠投影的记录明确提示，不伪装成无记录。
- 收尾读取最新位置与版本，包括同尺度更早的往期待办并标出其原周期；默认保留原位，可移入明确的下一周期或归档。已经移走／完成的条目不重复操作。写入失败停留当前步骤，可重试；不会误标复盘完成。
- 安排页显示目标周期已有的条目，仅给尚未覆盖的上级起草，晚到的模型结果不覆盖手工输入；确认后写入。没有历史记录时直接安排，全部完成时跳过空收尾。完成后恢复普通看板与往期入口。

本次变更的失败场景（实现前确认）：月初／跨年／周月合并读取错误周期；新工作区在锚点前无历史；已顺延条目重复移动；更早往期入口消失；当前状态覆盖历史；目标周期已有计划仍重复起草；关闭重开丢草稿；部分写入失败后继续或重复提交；整库替换后旧读取／模型结果写回；五种语言漏译与键盘焦点逃出抽屉。

- 周复盘入口在本周列头：本周最后一天出现「本周复盘」，下一周第一天出现「上周复盘」；最后一天已复盘或点了「这周跳过」，次日不再出现（最多连续两天）。月复盘同样遵守两天窗口，使用确认后的统一引导卡；卡片和抽屉明确显示实际月份，覆盖五种语言。
- 周入口使用「本周／上周」；月入口显示实际月份，抽屉显示年份。合并抽屉同时列出周与月。
- 独立周复盘入口是列头下方、与复选框左缘对齐的一行安静文字提示（琥珀小圆点 + 文案 + ›，无底色，悬停下划线），不再挤占列头；入口持续可见；「上一期」待复盘时，周期面板的常用按钮同样带琥珀点。较长文案省略显示，悬停可读完整标题。
- 周与月同一天结束时只出一个入口（本月列统一引导卡），步骤合并。
- 周复盘：回顾（模型小结 + 目标×周期矩阵）→ 本周收尾（保留原位 / 移入目标周期 / 归档）→ 排下周（为断链起草，可改、可取消）→ 完成（抽屉内结果清单，入口消失）。月复盘：回顾（任务数量、目标关联记录）→ 处理未完成 → 安排目标月（仅为未覆盖的目标起草）。合并：回顾 → 收尾 → 排下月 → 排下周。
- 没有可用模型时：回顾保留复盘小结的图标标题、统计与目标记录／矩阵，不出现空的 AI 正文或刷新按钮；排下周/下月为每条断链给空位，写了才创建。
- 复盘抽屉最大宽度 640px，并随窗口收窄；目标×周期矩阵优先为目标标题留空间，长标题可换行。底部用同款虚线空格、橙色边框配简短说明标识无行动和跳级，另保留点击目标筛选流程的提示；图例文案覆盖五种语言。
- 复盘小结按工作区、复盘周期与实际模型输入保存在本机，关闭重开、切换步骤和重启后复用；再次进入「回顾」时，若复盘周期事实、日期上下文或复盘偏好变化则更新。编辑设置不会逐字触发生成；拆解偏好、界面样式与普通刷新不触发新请求。标题行右侧提供「重新生成」图标按钮，使用本地化可访问名称与提示；按最新上下文刷新，期间禁用重复请求并保留上次内容，失败时提示并允许重试。缓存不进入工作区导出与备份，整库替换后清空。

### 右键菜单（CM2）

- 分组：「移到下周（日期）」「移到… ▸（接下来三个同尺度周期）」；「拆下一步」（有更短计划列时，与断点同一路径）「关联上级…」（打开详情的关联选择）；「完成」「删除」（有关联时先确认，移到回收站、可撤销）。不显示条目标题头。「选择日期…」未做。

### 设置 › 洞察

- 顶部与「设置 › 智能输入」同构：洞察总开关状态卡（控制是否调用模型起草；关闭后断点与复盘照常显示，只是不起草文字）与处理服务单选（只列能运行 DeepSeek 的 OpenRouter / AI Gateway；Key 在「设置 › AI 服务」管理）。
- 提示：断点 ＋、周复盘 · 月复盘两个开关，与模型开关互不影响。
- 个性化（只存本机）为四个标签页，默认「拆解」：关于我；拆解「一步有多大」（最小一步 / 1 小时内 / 半天）与补充要求；复盘语气（直接 / 温和 / 提问式）与优先关注（断链 / 过载 / 跳级 / 模糊目标）；完整提示词（系统规则只读，用户偏好以「用户偏好」追加）。左右方向键切换标签。
- 设置页不提供「试一试」生成：偏好在下一次拆解或复盘时生效，设置页不产生任何模型调用或工作区写入。

## 模型

- Jev（TypeSafe System One）只做选择/判断，不能写标题。起草与复盘小结走洞察所选服务的 chat completions：OpenRouter 用 `~deepseek/deepseek-flash-latest`；Vercel AI Gateway 用 `deepseek/deepseek-v4.1-flash`（2026-09-29 OpenRouter flash 别名指向的同一模型）并以 `providerOptions.gateway.only: ['deepseek']` 只路由到 DeepSeek。两者都必须关闭推理（`reasoning.enabled: false`）并要求 JSON。洞察有独立的开关与服务，不再依赖智能输入是否启用。Gateway 通道尚未用真实 Key 验证 DeepSeek 是否遵守关闭推理与 `json_object`。
- 断层 / 跳级 / 临期 / 过载等信号由代码计算，模型只负责措辞；提示词中文，用户偏好追加在末尾。
- 实测（2026-09-27，本机 key）：关推理后标题 0.8–2.6s、复盘 1.2–2s，偶发 10s；开推理时 9/12 空输出。

## 工程契约

- `src/domain/smart/insight.ts`：纯函数。`draftPrompt` / `reviewPrompt` 组装 system + user，`parseDraft` / `parseReview` 校验并清洗模型输出（标题去首尾标点、≤40 字、按任务 id 对齐），`gaps` 等信号计算供 renderer 与 prompt 共用。
- `src/main/smart/insight.ts`：`chatAdapter(provider, fetch?)`，POST OpenRouter `https://openrouter.ai/api/v1/chat/completions` 或 Gateway `https://ai-gateway.vercel.sh/v1/chat/completions`，超时 15s，错误复用 `classifyFailure(provider, …)`；`chatSample` 为连接测试的固定能力样例（要求回 `{"ok":true}`）。
- `SmartInputService.handle` 新增 `draft` / `review` 动作（`smartActionSchema`），回复 `draft` / `review`（`smartReplySchema`）；门控 = 洞察功能已对当前 generation 启用，所选服务 Key 可读、已同意且 DeepSeek 能力已验证；按服务冷却；账户级失败记到该服务；不缓存、不落盘、不记录正文。
- `insertBetween` 命令：在一个事务内创建里程碑（挂在原上级下）、把指定下级改挂到里程碑、解除它们与原上级的边；周期规则与 DAG 校验复核；一次撤销。
- `createPlan` 条目可带 `period`（`current` / `date`），用于复盘写入下一周期。
- `features/insight/Breakpoints.tsx`: one stable layer per workspace generation handles all active flows, deduplicating shared parents and preserving pending actions across preview exits. Board supplies the preview chain from `state/flows.ts`, using the same active graph and ancestor/descendant traversal as relation-line highlighting. Gap and skip controls stay within that chain; filtered overview remains flow-wide. Gap and skip buttons share the outgoing row endpoint, including row-motion updates; geometry observers run only while flows are active. Native preview and geometry evidence is recorded in `output/tests/insight/report.json` and `output/tests/ordering/report.json`.
- renderer：`state/insight.ts` 本机偏好（localStorage `goalloom.insight`），`features/insight/` 断点层、空列卡、复盘抽屉；新建窗口接受预填（上级、周期、草稿列表）。
- `state/review-summary.ts`: device-only `goalloom.review-summaries` cache, scoped by workspace generation and reviewed week/month keys, with one successful result per period and at most 24 entries. SHA-256 covers the actual review prompt (including review preferences, excluding draft-only preferences); only hashes and sanitised results persist. Concurrent identical requests share one promise, refresh failures preserve the previous entry, malformed/unavailable storage degrades to a session cache, and App invalidates both persisted and pending ownership on workspace replacement. Drafting remains uncached.
- `features/insight/ReviewSummary.tsx`: revalidates actual context on drawer/step entry, not while editing preferences behind another dialog; manual refresh uses the latest context, guards stale subscriptions, and keeps successful text visible during refresh or failure. The explicit refresh control and failure copy ship in all five locales.
- Draft and review mount effects share one pending request across StrictMode replay; each subscription ignores responses after its cleanup. Draft failures always end loading and leave editable rows with visible feedback. `pnpm dev` watches main/preload so generation actions and renderer callers remain on the same contract; previously started non-watching processes require a restart.

## 实现前失败场景

- Hover-preview acceptance: highlighted descendants with no children lack add buttons; multiple highlighted leaves show only one action; faded sibling branches show actions; switching dots leaves stale actions; an empty current target suppresses the local add action; the button disappears while crossing its source row; focus cannot reach the action; multi-flow membership duplicates buttons; leaving the preview leaves stale controls; completed/terminal/non-current items offer writes; clicking a descendant action chooses the hovered ancestor instead of that descendant or the wrong period; leaving and re-entering while generation is pending starts a second request.

- 信号：未来/历史周期视图误出 ＋；已完成/归档/删除条目出 ＋；多父条目重复出 ＋；Later 参与；横向滚动后 ＋ 落到错误列；虚拟行未挂载时锚点丢失。
- 写入：连点生成两条；生成期间版本变化（上级被编辑/删除）；周期在生成中翻过；跳级事务部分成功；撤销不完整或误删用户后续编辑。
- 模型：Key 缺失/未同意/智能关闭时仍请求；推理开启导致空输出；返回非 JSON、空标题、超长、重复同级、带 emoji；429 后连续请求；超时无反馈；workspace 替换后旧请求写入。
- 复盘：入口在第三天仍出现；跳过后次日仍出现；周月同日出两个入口；收尾写入已结束周期；排下周写入当前周期。
- 隐私：正文进入日志；关于我进入工作区/导出。
- Development regression: StrictMode replays mount effects, losing draft/review results or sending duplicate requests; a late response overwrites typed text or a reopened composer; failures leave loading active or hide the manual fallback; Settings generation changes workspace data; a renderer update calls an older main/preload contract when the development process is not watching those builds.
- Summary cache failure scenarios: closing while pending starts duplicate requests; reopening, step navigation or process restart discards a successful summary; changed board facts, review preferences or period reuse stale text; unrelated draft preferences or renderer revisions trigger regeneration; refresh failure deletes the last successful result; failed initial requests become cached; corrupt/full storage prevents generation; a late result repopulates cache after workspace replacement; saved entries contain prompts, credentials or grow without a bound; Settings trials accidentally reuse review cache.

## TODO

- [x] M1 规格、`draft`/`review` 模型通道、提示词与解析、本机偏好
- [x] M2 断点 ＋、跳级 `insertBetween`、⇧ 预填新建、首次引导
- [x] M3 空列卡与批量起草
- [x] M4 右键菜单 CM2（「选择日期…」除外）
- [x] M5 周 / 月 / 合并复盘（合并与月复盘仅按规则实现，桌面脚本在复盘日才覆盖对应分支）
- [x] M6 设置 › 洞察
- [x] 复盘小结本机缓存、按实际上下文失效、手动重新生成与失败保留；重启与工作区替换回归
- [x] 五语言文案
- [x] 月初的月复盘与周月合并复盘真实日期桌面验收（2026-10-01，生产无测试时钟；`node tests/desktop/month-review.mjs` 与 `--combined`）
- [ ] 月末当天的月／合并复盘真实日期桌面验收（生产无测试时钟，保留到月末运行）
- [ ] Windows 11 人工验收由所有者执行

## 验收

- [x] 2026-10-01「简报」预览落地：紧凑看板引导、无底色小结与行内统计、无模型图标标题、标题行刷新及文字底部按钮。`pnpm typecheck`、`pnpm test`（120 例）、`pnpm build`、insight、insight-generation（开发／生产）、月复盘、合并复盘及 language 通过；真实 Electron 截图与执行范围见 `output/tests/insight/review-brief-report.md`。
- [x] 2026-10-01 复盘界面回归调整：步骤连接线、紧凑统计与 AI 总结合卡、目标行悬停／聚焦反馈和方框首行对齐。`pnpm typecheck`、`pnpm test`（120 例）、`pnpm build`、完整 insight／insight-generation、月复盘／合并复盘与 language 脚本通过；真实 Electron 截图复核与范围记录在 `output/tests/insight/review-layout-report.md`。
- [x] 2026-10-01 月初与合并复盘：上一周期状态／条目、本期内容隔离、单入口、键盘焦点、原位保留／明确月份移动／归档、更早待办可达、草稿续接、已有计划去重，以及部分失败与未知写入回执恢复。真实 Electron/IPC/SQLite，写入失败仅在测试的 IPC 响应边界注入。报告与截图：`output/tests/insight/month-review/`、`output/tests/insight/combined-review/`。
- [x] 同次实现回归：`pnpm typecheck`、`pnpm test`（17 文件 / 120 例）、`pnpm build`、`pnpm test:insight`、`pnpm test:insight-generation`（开发与生产）、`pnpm test:language`、`node tests/desktop/review/run.mjs wire`、`pnpm test:electron`、`pnpm test:ui`、`pnpm test:history`、`pnpm test:periods` 通过。macOS 26.4.1 arm64 / Apple M3 Max，Electron 44.4.4 / Node 24.21.0 / SQLite 3.53.4；源码 Electron、独立测试数据，不代表安装包或 Windows 验收。完整范围与一次未复现的弹窗干扰记录见 `output/tests/insight/review-implementation-report.md`。

- [x] `pnpm test:insight`: hovering a monthly ancestor exposes its weekly leaf action; every highlighted leaf gets one action, including mixed month/week leaves and shared multi-flow descendants. Faded siblings stay quiet, and a descendant action creates under that descendant in today's period. Assertions and screenshots are in `output/tests/insight/report.json` and `hover-preview-*-chain.png` / `hover-preview-*-leaves.png` / `hover-preview-mixed-horizons.png`.
- [x] `pnpm test:insight-generation`: development and production renderer lifecycle, seven-item drafting, manual edits, close/reopen isolation, visible failure fallback, Settings retry without writes and review completion; repeatable reports/screenshots under `output/tests/insight/generation/`.
- [x] Summary-cache regression: pending-request reuse, close/reopen, step navigation, full Electron restart, explicit refresh, offline reuse, relevant preference/board invalidation, no regeneration while editing preferences, failed-request retry, corrupted/full storage, late-response isolation and verified workspace reset. The initial calendar chooses today as week start through the real setup UI so the weekly review is exercised on every run without a test clock.
- [x] `pnpm typecheck`、`pnpm test`（17 文件 / 120 例）。
- [x] `pnpm test:insight`（2026-09-27 周日，本周最后一天，macOS 26.4 arm64、Electron 44.4.4 源码运行）：空列卡批量/自己写、断点 ＋ 位置与一次性引导（重载后不再出现）、预填新建（最后一天写入下周并留去向标记）、跳级 insertBetween 与一次撤销、周复盘四步并排入下周、设置 › 洞察；报告与截图 `output/tests/insight/`。
- [x] `pnpm test:insight-live`（真实 OpenRouter）：批量起草 1.8s、断点单击直接创建 0.6s、复盘小结 1.8s；`output/tests/insight/live-report.json`。
- [x] 回归：`pnpm test:periods`（右键首项仍为顺延）、`pnpm test:composer`、`pnpm test:language`（设置 8 个面板无漏译）、`pnpm test:ui`、`pnpm test:feedback` 通过。
- [x] `pnpm test:relations`: relation and breakpoint overlays use distinct React keys; returning to all flows removes the old lines, and hover/focus previews and relationship editing pass.

## Private review-entry exploration

On 2026-09-28 the owner requested alternatives to the orange review pill because its visual treatment feels disconnected from the board. The isolated comparison at `http://127.0.0.1:5178/review-entry/?v=1` keeps the current entry as the baseline and explores inline text, a neutral outlined button and a below-header action row. The latter deliberately explores a placement change; it is not an accepted change to the current same-row contract. No direction is selected or integrated.

Start with `node output/prototypes/descriptions/serve.mjs`. Reproduce browser checks with `node output/prototypes/descriptions/review-entry/verify.mjs`; `--compact` selects compact/touch coverage. Synthetic local data and a destination preview exercise opening, closing, completion and dismissal without production writes or model requests. Evidence is in `output/tests/review-entry-prototypes/`. These checks do not replace the desktop acceptance above.

[PROTOCOL]: Update this header when making changes, then check README.md.
