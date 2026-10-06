# 流程洞察：断点、空列、复盘与右键菜单

> 顶部筛选与圆点预览都能在断链处给 ＋，一键补下一步；空列给一张起草卡；周期末在列头提供周/月复盘；待办右键菜单分组；设置 › 洞察可自定义起草与复盘的偏好。设计稿：Design 画布「目标聚焦 Insight 方案」（负责人 2026-09-27 确认）。

## 产品规则

### 断点 ＋（流程筛选与圆点预览）

- 只补下级：当前周期没有任何活跃下级时提示「下一步」，添加到下一更短尺度；已有本周或直接关联今天的下级时不提示。无需在现有上下级之间插入任务，也不自动改挂已有下级。

- 「全部」静止时不出 ＋；筛选某条流程时，本流程中「当前周期、未完成、未归档」的条目，若在当前周期没有任何活跃下级，在它行内右侧（离行边缘 6px，对齐首行中线）出一个流程色入口：静止时是 16px 细圈，悬停该行、键盘聚焦、首次引导或起草中时展开为「＋ 下一步」胶囊。入口始终在行底色内、不越过列分隔线，不遮挡沿分隔线走的连线总线。只提示最近一级：本周还没有下级时，今天列不为它出 ＋。Later 与今天列条目不出 ＋；目标列整列为空时不出逐项 ＋，由空列卡代替。
- 悬停或键盘聚焦有色流程圆点时，高亮链中每个缺少下级的待办末尾都显示同款 ＋；高亮范围包含该条目及其祖先、后代，淡化的旁支不显示。切换圆点时按钮跟随高亮链切换。下一列为空时仍可添加；源条目与目标周期必须是当期，Later 与今天条目不出 ＋。多流程归属只显示一个按钮。鼠标或焦点经过流程内任务及 ＋／引导时保持预览，离开后按原有 120ms 缓冲收起；纯悬停普通任务不启动预览。
- 单击 ＋：由模型起草一条标题并直接创建，与普通待办无异，不二次确认、无 Toast；上级已关联，目标周期为下一列的当前周期；若当前周（或月）今天结束，则写入下一周期，＋ 变为「下周 · 标题 →」去向标记，点击跳转查看。
- 「下一步」点击后立即把加号替换为旋转的加载图标，保持胶囊原色和文字直到起草与写入结束，期间阻止重复点击。失败转入手工填写后恢复按钮；⇧ 单击或无可用模型直接打开新建窗口。系统开启减少动态效果时保留加载图标但停止旋转。
- ⇧ 单击，或未连接可用的模型：打开全局新建窗口（⌘N），只预填上级与周期，其余与平常新建一致。
- 首次出现断点时给一次引导（第一个 ＋ 加重 + 说明卡），点「知道了」或点任一 ＋ 后不再出现；引导状态只存本机。说明卡随时间区视口边界定位，横向滚动后关闭按钮仍在可见范围内。

### 空列

链条为年 → 半年 → 3个月 → 本月 → 本周 → 今天；任意活跃当期下级都满足其上级，包括本月直接关联今天。年 / 半年未来周期可右键拆解，未来半年 / 3个月在其周期落入左列显示周期时提供空列卡，下级使用与上级同日开始的一期。半年起草为可验收阶段成果，3个月为季度里程碑；复盘矩阵包含六列。详见 [双日历模式](calendar-modes.md)。

- 半年、3个月、本月、本周、今天在显示周期整列为空，且上一列有未完成、未归档并没有任何显示周期下级的条目时，列内显示一张卡：「本周还是空的」、对应尺度的起草按钮及「自己写」。数量只在说明中显示，按钮和起草窗口标题不重复计数，单项与多项使用相同文案。五种语言同步。不出逐项 ＋。
- 2026-10-05 负责人确认起草动作按尺度区分：半年「起草阶段成果」、3个月「起草季度里程碑」、本月「起草本月计划」、本周「起草本周待办」、今天「起草今天待办」；批量起草窗口与复盘后安排卡复用同一文案。2026-10-06 负责人要求空列卡的两个按钮始终同排；桌面最小高度为 32px、同字号与行高，长翻译在按钮内自然换行并等高增长。触控目标至少 44px，保留键盘焦点反馈。
- 起草打开新建窗口的多条草稿（最多 8 条），每条带上级，可取消勾选，↵ 一次写入；「自己写」打开只预填周期的新建窗口。有待复盘周期时，本月／本周列由统一复盘引导卡替代空列卡。

### 复盘

- 2026-10-01 确认的月复盘设计：本月列把复盘、往期未完成和空列提示合并成一张引导卡，唯一主按钮开始／继续复盘；不显示「回顾进展 · 处理未完成 · 安排本月」及「为重要的方向，留出一点空间」。抽屉按明确的实际周期回顾 → 处理未完成 → 安排目标周期；关闭后本次会话保留步骤、选择和已编辑草稿。
- 2026-10-05 负责人确认本周复用同一规则：独立周复盘也使用统一引导卡，未完成数量收进卡片，不再并列显示往期入口或空状态。日期行显示实际周范围，标题／按钮使用本周、上周、下周；关闭后可继续，完成／已记录跳过后恢复往期入口，空列改为安排本周；安排卡复用复盘引导的底色、边框、日期行、标题和紧凑深色主按钮，日期使用当前目标周期，保留原有起草／手写行为。周月合并仍只在本月提供一个复盘入口。
- 2026-10-05 负责人确认周／月列头不显示「上周已复盘」等完成提示；已完成周期仍隐藏复盘入口，空列保留安排当前周期的引导。
- 2026-10-01 确认采用「简报」预览：复盘小结去掉大块底色，带图标的标题在前、AI 正文随后、三项统计在末尾同行排列并可换行；没有可用模型时也保留图标标题和统计。看板入口标题与 todo 同为 14px / 22px，内边距 12px，使用内容宽度的紧凑主按钮。2026-10-05 负责人确认底部「稍后／上一步」使用幽灵按钮，hover 显示共用背景色，保留键盘焦点反馈与左侧文案对齐。
- 步骤之间以细线连接，已完成步骤的连线在浅色／深色外观下仍可见；下方目标行整行提供悬停和键盘聚焦反馈，方框与箭头对齐标题首行，完成数量位于标题下方。
- 已结束周期的统计、目标记录与模型输入统一来自该周期截止时的历史投影；标题和说明使用当前文本，状态与位置使用截止时状态。回顾不使用本月空看板替代上月，也不将本月后来完成／顺延的状态倒填历史。无法可靠投影的记录明确提示，不伪装成无记录。
- 2026-10-05 负责人确认收尾默认移入明确的目标周期：周初移入本周，周末移入下周，月／合并复盘分别使用对应尺度的目标周期。可手动选择保留原位或归档，关闭后继续保留选择；选择本身不写入，点击下一步才提交。收尾读取最新位置与版本，包括同尺度更早的往期待办；条目下方不重复显示日期，顶部统一说明复盘范围。已经移走／完成的条目不重复操作。写入失败停留当前步骤，可重试；不会误标复盘完成。
- 收尾使用 Settings 共用的 Select 按钮与应用内菜单，图标保留内边距，支持键盘选择、Escape 关闭与焦点返回；弹层留在原生复盘 dialog 内。月／合并的任务记录复用看板的只读 Checkbox 状态、流程色及首行对齐，不再单独使用无色小方框；复盘记录、目标、收尾和安排页的已保存标题复用看板的 favicon／页面标题链接渲染；原始标题、历史和草稿不受展示元数据影响。
- 2026-10-05 负责人澄清复盘中的 todo 只读：目标矩阵、回顾记录、收尾待办、已有计划和起草来源的标题不提供点击／键盘按钮，不打开详情或筛选流程。移除带 i 的流程筛选说明。URL 继续使用页面标题展示与独立外部链接；收尾下拉、起草勾选／输入与复盘步骤按钮照常使用。
- 2026-10-05 负责人确认收尾列表使用紧凑的 todo 行：补充与看板一致的只读未勾选 Checkbox，并对齐标题首行；移除「全部移入目标周期」按钮；桌面下拉按钮高度降至 30px，长文案可自然增高；条目不设分割线，缩小行间距。
- 2026-10-05 负责人确认安排页只展示「为目标补上下一步」及未拆解的上级任务建议，不再重复列出已有安排。说明明确指出哪些来源周期任务还未拆到目标周期，五语言同步。上级与建议 todo 使用原任务的只读 Checkbox 样式／流程色，建议任务紧凑缩进，连线从上级 Checkbox 下沿接到下级 Checkbox 左侧中点；右侧使用与第二步收尾一致的下拉按钮／应用内菜单，选项明确为「排入本周／下周」等实际目标周期及「不排入」，按钮随文案收宽并居右，区分安排选择与任务完成。取消卡片外框，选项之间用分割线。
- 安排页仍仅为尚未覆盖的上级起草，晚到的模型结果不覆盖手工输入，确认后才写入。建议标题可直接编辑，聚焦时不显示激活边框／阴影；菜单与按钮保留键盘焦点反馈。「不排入」放在主按钮左侧，采用与「上一步」一致的幽灵按钮；跳过当前安排步骤且不创建任何建议任务，可在起草期间使用，未知写入回执核对期间禁用。合并复盘跳过月安排后继续周安排；各尺度起草状态独立，晚到的月结果不干扰周安排。没有历史记录时直接安排，全部完成时跳过空收尾。最后一步确认成功或明确不排入后，直接关闭面板并回到看板；不再停留在完成结果页。App 一次记录所有本次周期为已复盘，并清理保留会话，完成后的入口立即消失且重启不再出现；失败或未知回执继续留在当前步骤。关闭后触发一次现有 confetti，遵循入口所属列（合并复盘为本月）的撒花开关和系统减少动态效果设置。恢复普通看板与往期入口。
- 复盘建议生成使用本机缓存：关闭重开保留已编辑标题与排入选择；重新挂载或重启可复用同工作区、目标周期与生成输入的成功建议，进行中的相同请求共用一次生成。来源任务、看板事实或拆解偏好变化后重新生成；复盘语气等无关偏好不使建议失效。失败结果不缓存，整库替换清除旧代次建议。

本次变更的失败场景（实现前确认）：月初／跨年／周月合并读取错误周期；新工作区在锚点前无历史；已顺延条目重复移动；更早往期入口消失；当前状态覆盖历史；目标周期已有计划仍重复起草；关闭重开丢草稿；部分写入失败后继续或重复提交；整库替换后旧读取／模型结果写回；五种语言漏译与键盘焦点逃出抽屉。

- 周复盘入口在本周列头：本周最后一天出现「本周复盘」，下一周第一天出现「上周复盘」；最后一天已复盘或点了「这周跳过」，次日不再出现（最多连续两天）。月复盘同样遵守两天窗口，使用确认后的统一引导卡；卡片和抽屉明确显示实际月份，覆盖五种语言。
- 周入口使用「本周／上周」；月入口显示实际月份，抽屉显示年份。合并抽屉同时列出周与月。
- 周／月复盘入口为列内统一引导卡，持续可见；「上一期」待复盘时，周期面板的常用按钮同样带琥珀点。
- 周与月同一天结束时只出一个入口（本月列统一引导卡），步骤合并。
- 周复盘：回顾（模型小结 + 目标×周期矩阵）→ 本周收尾（保留原位 / 移入目标周期 / 归档）→ 排下周（为断链起草，可改、可取消）→ 直接返回看板（入口消失，按偏好撒花）。月复盘：回顾（任务数量、目标关联记录）→ 处理未完成 → 安排目标月（仅为未覆盖的目标起草）。合并：回顾 → 收尾 → 排下月 → 排下周。
- 没有可用模型时：回顾保留复盘小结的图标标题、统计与目标记录／矩阵，不出现空的 AI 正文或刷新按钮；排下周/下月为每条断链给空位，写了才创建。
- 复盘抽屉最大宽度 640px，并随窗口收窄；目标×周期矩阵优先为目标标题留空间，长标题可换行。底部用同款虚线空格、橙色边框配简短说明标识无行动和跳级；图例文案覆盖五种语言。
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

- `src/domain/smart/insight.ts`：纯函数。`draftPrompt` / `reviewPrompt` 组装 system + user，起草任务显式发送 `targetHorizon`：半年写阶段成果、3个月写可验收里程碑，小步长偏好不改变该周期粒度。`parseDraft` / `parseReview` 清洗模型输出（标题去首尾标点、≤40 字、按任务 id 对齐）；断点等信号由 renderer 计算。
- `src/main/smart/insight.ts`：`chatAdapter(provider, fetch?)`，POST OpenRouter `https://openrouter.ai/api/v1/chat/completions` 或 Gateway `https://ai-gateway.vercel.sh/v1/chat/completions`，超时 15s，错误复用 `classifyFailure(provider, …)`；`chatSample` 为连接测试的固定能力样例（要求回 `{"ok":true}`）。
- `SmartInputService.handle` 新增 `draft` / `review` 动作（`smartActionSchema`），回复 `draft` / `review`（`smartReplySchema`）；门控 = 洞察功能已对当前 generation 启用，所选服务 Key 可读、已同意且 DeepSeek 能力已验证；按服务冷却；账户级失败记到该服务；不缓存、不落盘、不记录正文。
- Child creation uses `create` / `createPlan` only. Intermediate-milestone UI, drafting and the `insertBetween` command were removed by owner request on 2026-10-04. Existing direct relations and persisted operation history remain intact; import validation still recognizes historical operations. Review skip facts remain descriptive and never expose a repair action.
- Legacy import failure cases (2026-10-05): accept a historical milestone's single create plus one reparenting effect per child, preserve its events/receipts and prior undo through JSON/SQLite restore, and reject extra creates, duplicate children or malformed edge pairs. Restore still invalidates old-generation undo; the retired live command remains rejected. Synthetic coverage belongs to `test:calendar` and the restore path to `test:recovery`; no personal workspace content enters fixtures.
- A move that leaves an item in the same position records an unchanged receipt without effects. JSON/SQLite import must preserve this valid receipt; the one-position-effect rule applies only to changed moves. The legacy calendar fixture covers this restore failure case.
- `createPlan` 条目可带 `period`（`current` / `date`），用于复盘写入下一周期。
- `features/insight/Breakpoints.tsx`: one stable layer per workspace generation handles all active flows, deduplicating shared parents and preserving pending actions across preview exits. Board supplies the preview chain from `state/flows.ts`, using the same active graph and ancestor/descendant traversal as relation-line highlighting. Childless-parent controls stay within that chain; filtered overview remains flow-wide. Next-step buttons use the outgoing row endpoint, including row-motion updates; geometry observers run only while flows are active. Native preview and geometry evidence is recorded in `output/tests/insight/report.json` and `output/tests/ordering/report.json`.
- Pending breakpoint actions expose `aria-busy` and swap the add glyph for the bundled Hugeicons loading glyph. `insight.css` keeps that pending action at full opacity and its final hover colours immediately, rotating only its SVG; reduced motion stops rotation without hiding loading feedback. The existing pending lifetime includes both drafting and guarded submission and clears on manual fallback.
- `features/insight/signals.ts`: `breakpoints` accepts an optional highlighted chain instead of a preview boolean. It scopes parents and direct day children before batching; the returned children drive both the skip label and its write. A null chain preserves overview/review rules.
- renderer：`state/insight.ts` 本机偏好（localStorage `goalloom.insight`），`features/insight/` 断点层、空列卡、复盘抽屉；新建窗口接受预填（上级、周期、草稿列表）。
- `state/review-summary.ts`: device-only `goalloom.review-summaries` cache, scoped by workspace generation and reviewed week/month keys, with one successful result per period and at most 24 entries. SHA-256 covers the actual review prompt (including review preferences, excluding draft-only preferences); only hashes and sanitised results persist. Concurrent identical requests share one promise, refresh failures preserve the previous entry, malformed/unavailable storage degrades to a session cache, and App invalidates both persisted and pending ownership on workspace replacement.
- `state/review-drafts.ts`: review-only `goalloom.review-drafts` cache, keyed by destination horizon/start date with an exact drafting-prompt fingerprint. At most 24 validated batches persist; identical pending inputs share a promise, failures are not cached and stale ownership cannot replace newer context/generation. App clears old-generation entries and ownership alongside summaries. `requestDraft` accepts an optional preference snapshot so fingerprinting and network input agree; ordinary composer/breakpoint drafting retains its existing fresh-request behavior.
- `features/insight/ReviewSummary.tsx`: revalidates actual context on drawer/step entry, not while editing preferences behind another dialog; manual refresh uses the latest context, guards stale subscriptions, and keeps successful text visible during refresh or failure. The explicit refresh control and failure copy ship in all five locales.
- Draft and review mount effects share one pending request across StrictMode replay; each subscription ignores responses after its cleanup. Draft failures always end loading and leave editable rows with visible feedback. `pnpm dev` watches main/preload so generation actions and renderer callers remain on the same contract; previously started non-watching processes require a restart.

## 实现前失败场景

- Empty-card row regression (2026-10-06): a long translation moves the entire secondary action onto another row at the 320px column minimum; shrinking controls clips labels, moves the primary icon or produces unequal heights/hit targets. Measure native five-locale future-half cards and all five English draft actions, keeping the linked batch/manual creation scenarios.

- Empty-card action polish (2026-10-05): actions still say the same generic next step at every horizon; button/composer/invitation labels disagree; shared primary/secondary heights remain 32/30px; translated text overflows or focus feedback disappears; draft/manual clicks change their parent or displayed-period target. Extend existing native empty-card coverage with a focused selector, check horizon labels and actual equal-height hit targets, and retain linked batch/manual creation.

- Completed-review note removal (2026-10-05): a week/month column still renders the redundant completed-period label; reload brings it back; removing completion state instead of its presentation revives the review entry or loses the empty-period planning invitation. Extend the existing first/last-day invitation scenario to check immediate/reloaded absence and retained linked creation.

- Cross-scope consistency audit (2026-10-05): monthly/combined records keep old small uncoloured markers; task state, flow colour or first-line alignment differs from original todos; combined month confirmation ends the review early, skipping month skips week, or either step loses edited drafts. Verify actual monthly/combined ReviewDrawer/ReviewOverview through an isolated native component renderer using real preload/main/SQLite and explicit review-period props. The authoritative clock and natural date-window rules remain unchanged; component acceptance does not claim packaged/date-window entry or replace prior shared-App lifecycle evidence.

- Post-review invitation styling (2026-10-05): the empty current-period planning card keeps a separate transparent frame, bold title or secondary button; its date names the reviewed period instead of the actual target; a shared class accidentally recreates the review entry or changes current-period child creation. Compare the invitation's computed frame/meta/title/action styles with the review guide, verify the current dates, and use the actual drafting action to create one linked current-week item in focused first/last-day native scenarios.

- Review completion exit (2026-10-05): the final confirmed plan or explicit skip leaves a terminal screen; the closed session retains a continue entry before reload; completion keys are marked too early or individually lose one combined period; rejected/lost writes close the panel or duplicate plans; resolving the last plan receipt still requires an extra click; manual close destroys resumable drafts. Verify rejected-then-confirmed creation, lost receipt resolution, explicit skip, immediate board return/absent entry, persistent period marks and linked item fidelity in focused first/last-day native scenarios. The owner subsequently requested the existing confetti after review completion: verify one actual burst after closure, no burst for unconfirmed writes, per-column disable/reduced-motion suppression and no replay after reload.

- Borderless review editing (2026-10-05): removing only the outline leaves the composer focus shadow; a broad selector removes dropdown/button focus feedback or disables draft editing. Verify an actively focused review draft has no border, outline or shadow, retains editable text, and Tab still reaches a visible-focus inclusion dropdown in the existing weekly native scenario. Keep focused acceptance per the owner's instruction.

- Planning hierarchy polish (2026-10-05): parent/child spacing stays oversized, the line stops short of either marker or misses the child midpoint after title wrapping/theme changes; the destination label says the wrong week; a fixed/full-width trigger leaves empty space or fails to stay at the right edge. Measure actual marker/connector edges for wrapped and short titles, compact gap, intrinsic trigger width/right alignment, first/last-day destinations, menu interaction and retained draft state in the weekly native scenario. The owner requested focused acceptance instead of complete E2E for this correction.

- Planning dropdown correction (2026-10-05): inclusion still renders as a switch; planning controls drift from closing controls in height, padding or chevron inset; the custom menu portals outside the native modal; keyboard selection/Escape loses focus or closes review; choosing exclusion changes task data, discards edited text or repeats generation. Verify shared Select appearance, include/exclude choices, keyboard/focus dismissal, unchanged draft/cache behavior and linked creation/skip through the existing native weekly and generation scenarios.

- Review draft caching and inclusion controls (2026-10-05): the right-hand selector still resembles task completion; its label or keyboard state is unclear; toggling it changes the original task. Closing, step navigation or remounting repeats a pending/successful request or overwrites typed titles and exclusions; changed draft inputs reuse stale suggestions; failures become cached; corrupt/full local storage prevents manual work; persisted entries contain prompts/keys or grow without bounds; workspace replacement retains old results. Verify native labelled switches and unchanged todo markers, held close/reopen, edits/exclusions, reload reuse, input/preference invalidation, failure recovery and generation cleanup in development and production.

- Plan-step redesign (2026-10-05): existing plans still crowd the suggestion step or are removed from deduplication; source/target copy names the wrong period; source checkboxes lose their flow colour or toggle inclusion; the selection control stays left; child drafts lack indentation/connector or get clipped; old card borders remain; skip creates checked drafts, loses resume state, skips both combined steps or bypasses an unresolved receipt; a late skipped-month draft clears the weekly loader. Verify first/last-day source/target copy, two-parent geometry and colours, independent right-side selection, retained drafts, skip without writes, normal linked creation, five locales and the existing failure/receipt workflows.

- Compact closing rows (2026-10-05): task markers are missing, become actionable or misalign on multiline titles; the redundant move-all action remains in another locale; smaller selects clip translated values/icons; separators or old 66px row spacing remain; compact layout changes keep/archive/default decisions or loses resume state. Verify native first/last-day markers and alignment, absent bulk/dividers, 30px single-line choices, all appearances, long titles and the full existing closing workflow.

- Read-only review correction (2026-10-05): removing the explanatory text leaves a hidden title/filter button in the matrix; other review surfaces still open details; a parent click changes its plan checkbox; keyboard traversal still reaches a task action; plain task clicks change board filters, navigate or mutate data; removing title actions loses saved URL metadata. Verify real matrix/closing/existing/source clicks, absent title buttons/tab stops, retained review state and drafts, unchanged storage and independent link opening in first/last-day native fixtures.
- Review footer hover: Later/Back show only an underline, the hover surface has no inset, dark/minimal appearances use a hard-coded colour, or padding shifts the text away from the header alignment. Verify shared hover background in all four appearances with native screenshots and enabled/disabled styling kept distinct.

- Superseded navigation exploration (2026-10-05; removed after the owner clarified that review tasks are read-only): the removed info hint survives in another locale; saved task titles remain inert in records/closing/existing plans/sources; a title click toggles its plan checkbox or a URL opens details; details close the review, lose its choices/drafts/scroll or reveal a background board row; Escape closes both dialogs; keyboard activation cannot open a past task; details navigation changes historical review facts or submits closing decisions. Verify native first/last-day closing and plan-source round trips, explicit keyboard/focus return, unchanged records and two-item legend, plus monthly record entry when its real-date UI is available.
- Superseded navigation failure case: a detail decomposition launched from review can place the new input behind the still-modal review or fail to focus it. Close the parent review before opening the existing inline entry; cancelling creation and continuing review must retain its plan draft and checkbox.

- Review controls and titles (2026-10-05): completed-step connectors disappear because their colour token is outside the review scope; a custom menu portals behind the native dialog or Escape closes the review; the chevron touches the trigger edge or translated choices are clipped; raw saved URLs leak into review records, closing rows or plan sources; links nest inside the matrix's filter button; metadata changes source text/history; a default move is displayed but confirmation still keeps the item; choosing or dismissing a menu writes prematurely; manual keep/archive choices disappear on resume; earlier backlog moves into the wrong horizon/period; partial failures repeat committed moves; per-row dates duplicate the header. Verify first/last-day weekly destinations, all three decisions, resumed sessions, connectors in four appearances, cached read-only links and keyboard/focus/menu screenshots with isolated native Electron data.

- Weekly guide consolidation (2026-10-05): first/last-day weekly reviews still show backlog and empty hints alongside the guide; the unfinished count omits earlier backlog or current-period tasks; closing cannot resume the weekly session; completion leaves the guide visible or hides retained backlog; the empty-column invitation creates a month item instead of a week item; processed review keys reappear after reload; weekly copy leaks a monthly label or untranslated text; combined review gains a second entry. Verify real first/last-day calendars, preserved tasks, resume/completion, explicit weekly creation and five-language entries, with reports/screenshots under `output/tests/insight/weekly-review/`.

- Child-only breakpoint regression (2026-10-04): a month with current week and/or directly linked day children must never offer an intermediate milestone or reparent its children. Month/root/day previews, keyboard previews and filtered overviews must preserve the same direct edges; a genuine childless week still offers its next step. The retired `insertBetween` write must be rejected without changing the workspace.

- Breakpoint loading: disabled styles fade the active action; only opacity pulses instead of a visible spinner; hover exit hides pending feedback; repeated clicks start multiple requests; success or failure leaves the spinner active; manual entry keeps a loading state; reduced-motion preferences are ignored. Cover next-step success and failure with held synthetic requests, actual animation frames and completion/failure screenshots.


- Six-column viewport regression (2026-10-03): a visible month breakpoint placed the guide's dismissal 258px beyond the native board. `test:relations` asserts guide bounds before dismissal; geometry must keep the whole guide inside the timeline while scrolling.

- Hover-preview acceptance: highlighted descendants with no children lack add buttons; multiple highlighted leaves show only one action; faded sibling branches show actions; switching dots leaves stale actions; an empty current target suppresses the local add action; the button disappears while crossing its source row; focus cannot reach the action; multi-flow membership duplicates buttons; leaving the preview leaves stale controls; completed/terminal/non-current items offer writes; clicking a descendant action chooses the hovered ancestor instead of that descendant or the wrong period; leaving and re-entering while generation is pending starts a second request.

- 信号：未来/历史周期视图误出 ＋；已完成/归档/删除条目出 ＋；多父条目重复出 ＋；Later 参与；横向滚动后 ＋ 落到错误列；虚拟行未挂载时锚点丢失。
- 写入：连点生成两条；生成期间版本变化（上级被编辑/删除）；周期在生成中翻过；撤销不完整或误删用户后续编辑。
- 模型：Key 缺失/未同意/智能关闭时仍请求；推理开启导致空输出；返回非 JSON、空标题、超长、重复同级、带 emoji；429 后连续请求；超时无反馈；workspace 替换后旧请求写入。
- 复盘：入口在第三天仍出现；跳过后次日仍出现；周月同日出两个入口；收尾写入已结束周期；排下周写入当前周期。
- 隐私：正文进入日志；关于我进入工作区/导出。
- Development regression: StrictMode replays mount effects, losing draft/review results or sending duplicate requests; a late response overwrites typed text or a reopened composer; failures leave loading active or hide the manual fallback; Settings generation changes workspace data; a renderer update calls an older main/preload contract when the development process is not watching those builds.
- Summary cache failure scenarios: closing while pending starts duplicate requests; reopening, step navigation or process restart discards a successful summary; changed board facts, review preferences or period reuse stale text; unrelated draft preferences or renderer revisions trigger regeneration; refresh failure deletes the last successful result; failed initial requests become cached; corrupt/full storage prevents generation; a late result repopulates cache after workspace replacement; saved entries contain prompts, credentials or grow without a bound; Settings trials accidentally reuse review cache.

## TODO

- [x] 2026-10-05 空列起草按钮按半年／3个月／月／周／日区分文案，与起草窗口及复盘后安排入口一致；两个按钮桌面高度统一为 32px，五语言同步。定向原生场景实测周／日按钮高度、字号、点击命中与批量／手写创建，周初／周末安排卡验证文案及起草窗口一致；运行范围与证据：`output/tests/empty-card/report.json`。

- [x] 2026-10-05 移除周／月列头的「已复盘」完成提示，清理专属样式与五语言闲置文案；保留周期完成状态及空列安排入口。周初／周末定向场景验证完成／重载后无提示、复盘入口持续隐藏及关联创建；证据与运行范围：`output/tests/review-status-removal/report.json`。

- [x] 2026-10-05 全复盘一致性补查：收尾／建议／缓存／完成退出／入口清理／撒花及安排卡均使用共用实现；补齐月／合并任务记录的原 Checkbox 完成状态／流程色与首行对齐。月、合并月→周、合并跳过月→周三个原生组件定向场景验证只读富链接、紧凑自定义下拉／默认目标、无重复日期／批量按钮／已有安排、无激活边框、草稿续接与真实月周写入，156 项测试、最终类型检查／build 通过。未修改主进程时钟或自然入口规则，未跑完整 E2E；组件页面不代表日期窗口 App 验收。夹具边界校验修正、截图、实际命令和既有共用证据范围：`output/tests/review-scopes/audit-report.json`。

- [x] 2026-10-05 复盘后「安排本周」卡复用复盘 guide：同底色／边框／12px 内距、日期行、14px 标题及深色带箭头主按钮，删除独立 invitation 外观；日期指向当前目标周期，原起草／关联创建保留。`weekly-review.mjs --invitation` 周初／周末实测 frame／meta／title／action 样式完全一致并创建一项关联当前周任务，typecheck、156 项测试与 build 通过；未跑完整 E2E。截图、实际命令、平台及月界面限制：`output/tests/review-invitation/report.json`。

- [x] 2026-10-05 完成复盘直接返回看板：移除结果页及五语言旧文案，App 批量记录周期并清理会话，入口立即消失且重载不再出现；最后计划未知回执核对成功后直接完成，拒绝／未确认时保持面板与选择。关闭后复用原 confetti，一次播放，遵循入口列开关及减少动态效果。按负责人要求完成四个定向周初／周末确认／跳过场景，实测左右下角 Canvas 起点、无重复创建、禁用／取消／重载不重播；typecheck、156 项测试、build 通过，未跑完整 E2E。月／合并界面日期窗口及测试初次清理／回执拦截问题保留在 `output/tests/review-completion/report.json`。

- [x] 2026-10-05 建议输入框去掉聚焦边框与 composer 阴影，仅作用于复盘建议；可编辑、Tab 到下拉时的可见焦点及关闭续接保持。按负责人要求运行 `weekly-review.mjs --draft-focus`：周初／周末均确认 focus-visible 为真、outline／shadow 为 none、border 为 0px，编辑／选择不写入，typecheck、155 项测试、build 通过。此前包含脚本在无关 hover 断言处中断，保留原检查与未确认原因；未重跑完整 E2E。截图、运行范围与实际命令：`output/tests/review-draft-focus/report.json`。

- [x] 2026-10-05 安排建议细化：右侧复用收尾 Select／菜单并按文案收宽居右，五语言明确本周／下周等实际目标；父子间距与缩进收紧，连线接到父 Checkbox 下沿及子 Checkbox 左侧中点。按负责人要求仅做定向验收：周初／周末的真实几何、104px 按钮、菜单键盘／Escape／焦点、草稿续接、跳过／关联创建通过，typecheck、155 项测试、build 通过；未重跑完整 E2E。首次键盘断言及此前较宽范围运行的失败／未验证边界保留在 `output/tests/review-plan-layout/report.json`，截图同目录。

- [x] 2026-10-05 安排页右侧改为五语言「排入」文字开关，与只读 todo 标记区分；复盘建议增加本机成功缓存和相同等待请求复用。开发／生产模式均验证关闭续接保留编辑与选择、重新挂载复用、来源／拆解偏好变化失效、无关复盘偏好复用、坏缓存／失败恢复及真实重置清理；周初／周末键盘开关、排入／跳过和完整 insight、generation、language、typecheck、155 项测试、build 通过。月／合并历史 API 通过，界面仍受日期窗口限制。具体命令、截图、运行版本／平台与未验证边界：`output/tests/review-draft-cache/report.json`。

- [x] 2026-10-05 安排建议页：隐藏已有安排并保留去重，五语言来源／目标周期说明，右侧排入勾选、父子原样式／流程色 Checkbox、缩进连线与行间分割线；「不排入」跳过当前安排且无写入，起草状态按月／周独立。周初／周末两来源任务几何／颜色、跳过／正常关联创建／续接，以及完整 insight／generation（开发／生产的等待期间跳过按钮可用性）、language、links、typecheck、155 项测试、build 通过。月／合并历史 API 通过，合并跳过界面与晚到月结果场景受真实日期窗口限制。报告、截图与运行范围：`output/tests/review-suggestions/report.json`。

- [x] 2026-10-05 紧凑收尾列表：只读 Checkbox 首行对齐，移除批量移入按钮／五语言文案，单行下拉 30px，短行 34px、4px 间距且无分割线。周初／周末实际几何与原有处理／续接流程、四外观、完整 insight／generation、language、links、typecheck、155 项测试与 build 通过；月／合并历史 API 通过，界面仍受日期窗口限制。报告、截图及运行版本／平台范围：`output/tests/review-compact/report.json`。

- [x] 2026-10-05 只读修正与按钮 hover：移除目标矩阵筛选按钮及复盘各处 todo 详情入口；URL 展示与独立外部链接保留。「稍后／上一步」以共用背景色显示 hover，左侧文案保持对齐。周初／周末实际点击、四外观、完整 insight／generation、links、language、task-focus、ui、virtual、typecheck、155 项测试与 build 通过；月／合并历史 API 通过，月界面受日期窗口限制。命令、截图、Electron／Node／SQLite 与平台范围：`output/tests/review-readonly/report.json`。

- [x] M1 规格、`draft`/`review` 模型通道、提示词与解析、本机偏好
- [x] Child-only breakpoints (2026-10-04): remove intermediate-milestone entries, drafts and writes; direct-child preservation and next-step success/failure passed across previews and filtered views. Validation: `pnpm typecheck`, `pnpm test` (154 tests), `pnpm build`, `pnpm test:insight`, `pnpm test:insight-generation` (development / production), `node tests/desktop/month-review.mjs`, `node tests/desktop/month-review.mjs --combined`, `pnpm test:relations`. Repeatable evidence: `output/tests/child-breakpoints/report.json` and `output/tests/insight/child-only-*.png`. Source Electron 44.4.4 / Node 24.21.0 / SQLite 3.53.4 on macOS 26.4.1 arm64, Apple M3 Max; physical/VM status unverified. Month/combined review scripts exercised historical APIs; their monthly UI branch was outside the date window. Packaged / Windows / live-provider / full-project verification remains outside this change.
- [x] M2 断点 ＋、⇧ 预填新建、首次引导（2026-10-04 按负责人要求移除补中间里程碑）
- [x] M3 空列卡与批量起草
- [x] M4 右键菜单 CM2（「选择日期…」除外）
- [x] M5 周 / 月 / 合并复盘（合并与月复盘仅按规则实现，桌面脚本在复盘日才覆盖对应分支）
- [x] 本周复用统一复盘引导、继续复盘与完成后本周安排；周初／周末原生场景、生成开发／生产模式及五语言通过。证据：`output/tests/insight/weekly-review/`；完整命令、既有 Later 校验失败与月复盘日期窗口限制见 `output/tests/weekly-guide-fix/report.json`。
- [x] 2026-10-05 复盘界面调整：已完成步骤连线、共用 Select 菜单与内缩箭头、默认目标移动、保留／归档续接、链接页面标题、独立链接／目标筛选点击范围，以及移除条目日期。周初／周末原生用例、四外观、部分失败重试、完整 insight／generation（开发与生产）、links、五语言、typecheck、155 项测试与 build 通过。月／合并脚本通过历史 API；当前日期不在月复盘窗口，界面分支未执行。完整命令、范围与截图：`output/tests/review-controls/report.json`。
- [x] 2026-10-05 带 i 的矩阵说明已移除；先前误解需求所实现的详情入口已被只读要求取代。当时验证的复盘记录／待办／已有计划／起草来源可打开详情，返回保留选择、草稿、滚动与输入方式对应的焦点；详情拆解可进入正常新建并继续原复盘。周初／周末、完整 insight／generation、五语言、links、task-focus、ui、virtual、typecheck、155 项测试与 build 通过。月／合并历史 API 通过，记录点击的月界面分支受实际日期窗口限制。源码 Electron 44.4.4 / Node 24.21.0 / SQLite 3.53.4，macOS 26.4.1 arm64 / Apple M3 Max；实机／VM 未独立确认。报告与截图：`output/tests/review-navigation/report.json`。
- [x] M6 设置 › 洞察
- [x] 复盘小结本机缓存、按实际上下文失效、手动重新生成与失败保留；重启与工作区替换回归
- [x] 五语言文案
- [x] 月初的月复盘与周月合并复盘真实日期桌面验收（2026-10-01，生产无测试时钟；`node tests/desktop/month-review.mjs` 与 `--combined`）
- [ ] 月末当天的月／合并复盘真实日期桌面验收（生产无测试时钟，保留到月末运行）
- [ ] Windows 11 人工验收由所有者执行

## 验收

- [x] 最小 320px 列宽下，五语言未来半年空列卡及五种英文起草动作的按钮始终同排、等高，文案在按钮内换行且可实际点击；既有批量／手写创建保留原周期与关联。原生几何与截图见 `output/tests/empty-card-layout/native/`，创建证据见 `output/tests/insight/`。

- [x] Breakpoint loading (2026-10-03): development and production Electron cover held next-step/bridge requests, actual rotation frames, unchanged full pill colours, hover exit, duplicate-click suppression, success, failure-to-manual recovery, Shift-click and reduced motion. Reports and screenshots: `output/tests/insight/generation/{development,production}-report.json` and `*-breakpoint-loading.png` / `*-bridge-loading.png`; final scope and commands: `output/tests/breakpoint-loading/report.json`.

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
