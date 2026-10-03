# renderer/

> 父级：[项目地图](../../docs/development.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 首屏看板、按需加载配置/弹窗、全局快捷键与反馈；composer 首次打开后按工作区代次保留草稿
├── main.tsx                 # React 挂载
├── index.html               # 本地页面；生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind, theme tokens, board/dialog/menu layout, column action visibility, scrollbars and accessibility
├── assets/app-icon.png      # 关于页的应用图标（resources/icon.png 的 256px 版本）
├── features/                # 按用户功能聚合页面及其专属组件
│   ├── shell/               # 应用外壳：常驻顶栏及其打开的全局弹窗
│   │   ├── TopBar.tsx       # Draggable titlebar: independent Later/count toggle, flow filters, search and settings
│   │   ├── CommandPalette.tsx # Debounced search with actual-period hints, commands and detail navigation
│   │   ├── CompletionCelebration.tsx # Exact-corner Canvas bursts with a broad viewport-scaled fan; nonmodal top layer, reduced motion and generation cleanup
│   │   ├── FeedbackLayer.tsx # Nonmodal feedback layer inside the active native dialog, preserving focus and usable Toast actions
│   │   ├── completion-celebration.css # 装饰画布和 backdrop 的全窗口透明、指针穿透样式
│   │   └── settings/        # 左侧导航（偏好/AI/工作区/条目/Goalloom › 关于）+ 页头说明 + 分组卡片的设置弹窗；外观含语言，关于页含版本与软件更新
│   │       ├── Settings.tsx     # Container: grouped navigation, section headings with shortcut guidance, backup/count reads, data actions and transfer previews
│   │       ├── AppearancePane.tsx # Language, visual styles, theme and device relation-line switch
│   │       ├── BoardPane.tsx      # Device parent-order switch, atomic disable/materialization and per-column completion-confetti preview
│   │       ├── ShortcutsPane.tsx # 快捷键：通用组点键帽录制、冲突警告与清除；流程筛选开关 + 位置示意
│   │       ├── AiPane.tsx       # AI 服务：已连接/可添加服务、能力标签、Key 遮罩与测试日期、账户问题与重测、移除前说明、隐私要点
│   │       ├── FeatureControls.tsx # 智能输入/洞察共用：功能总开关状态卡与处理服务单选（只列能运行该模型的服务）
│   │       ├── SmartPane.tsx    # 智能输入：总开关 + 处理服务（Jev）
│   │       ├── InsightPane.tsx  # Insight: switch + DeepSeek provider, breakpoint/review switches, personalization tabs (about me / drafting / review / read-only prompt)
│   │       ├── CalendarPane.tsx # Locked summary, current-year timeline with next year/half/3-month starts, a change-calendar row into the reset, aligned rollover rows
│   │       ├── BackupPane.tsx   # 备份与恢复：状态/每日开关/保留份数、备份列表、导出与单一文件恢复、危险区重置（从日历「更换日历」进入时定位并聚焦）
│   │       ├── ItemsPane.tsx    # 条目：已完成/已取消/已归档/回收站的搜索、今天/昨天分组与行内还原
│   │       ├── TransferReview.tsx # 来源日历模式预览、三步进度与整库替换的两阶段确认
│   │       ├── parts.tsx        # 分组/行（可带整行下方控件）/分段选择（色块、数量）/多选按钮组/开关原语，工作区时区时间与相对日期
│   │       └── settings.css     # 设置弹窗专属样式（仅 token）
│   ├── composer/            # 全局新建：输入法式（输入 → 一条 Jev 推荐 → ↵ 创建 / Tab 调整 / ⌥↵ 原样存 Later）
│   │   ├── Composer.tsx     # 输入/防抖/IME、修订回声、候选条各状态、↵/Tab/⌥↵ 与调整列表键位、失败降级、会话草稿与 createPlan 确认
│   │   ├── Plan.tsx         # 推荐的只读呈现（单件一句话、多件一行一件）、拿不准的「可能…」旁注、Jev 标记
│   │   ├── DraftRow.tsx     # Inline T/D/P adjustment, shared deadline calendar with workspace week start, parent/flow menus, merging and text editing
│   │   ├── KeyMenu.tsx      # 行内菜单的键盘外壳：↑↓ 移动、数字直选，Esc 交给 Popover
│   │   ├── suggestions.ts   # 纯函数：上级关联与移列规则、片段合并、Jev 拿不准的判断（doubts）
│   │   ├── draft.ts         # 纯草稿模型：手动优先合并、推测列、orphan、计划负载与本地复核
│   │   ├── Seeded.tsx       # Displayed-period create / insertBetween / checked createPlan, including future half/cycle; typed-text precedence and manual fallback
│   │   └── composer.css     # composer 与连接表单样式（仅 token）
│   ├── insight/             # 流程洞察（docs/features/flow-insight.md）
│   │   ├── signals.ts       # Six-scale gaps/digests; displayed-period empty sources exclude active children and constrain future half/cycle to the displayed parent
│   │   ├── Breakpoints.tsx  # Highlighted-chain row endpoints, pending/destination state and a guide bounded to the timeline viewport
│   │   ├── decompose.ts     # 「拆下一步」唯一写入路径：模型起草后 create / insertBetween，⇧ 或无模型时打开预填新建（断点与右键共用）
│   │   ├── EmptyCard.tsx    # 空列卡：为上一列各起一步（批量预填）或自己写
│   │   ├── review.ts        # 复盘纯规则：入口（最后一天 / 次日一次，周月同日合并）、目标×周期、信号、排下一期候选
│   │   ├── ReviewDrawer.tsx # Review → wrap up → plan month/week → finish; period-aware titles, readable goal matrix with visual legends, period-scoped writes and a cached summary brief
│   │   ├── ReviewOverview.tsx # Summary-first brief with inline counts, expandable month records and weekly flow matrix
│   │   ├── ReviewSummary.tsx # Persistent localized icon heading, optional cached AI content, header refresh and retained results on failure
│   │   ├── review.css       # Todo-scale monthly guide, unfilled review brief, text footer actions and responsive native modal using shared tokens
│   │   └── insight.css      # Breakpoints, hints, empty-column cards and weekly review entry
│   ├── smart/
│   │   ├── ProviderConnect.tsx # 单个服务的 Key（标签旁官方控制台入口）、点名该服务的同意、逐能力测试结果（Onboarding/设置共用；提交按钮可渲染到底部按钮行）
│   │   ├── JevDemo.tsx      # 不调用服务的预设示例动画：逐字输入 → 整理中 → 草稿卡
│   │   └── AiStep.tsx       # 首次流程第 3 步：先看示例，再在服务卡片里选一个并填 Key，显示实际开启的功能；随时可跳过
│   ├── board/
│   │   ├── Board.tsx        # Unified period navigation, period-named review entries, independent placement/relation gestures, virtual source pinning and preserved focus
│   │   ├── BoardLayout.tsx # Persistent 300px Later sidebar, separate horizontal timeline, interruptible WAAPI and drag measurement synchronization
│   │   ├── geometry.ts     # Shared panel/drop viewport clipping for drag, overlays and result visibility
│   │   ├── useBoardDrag.ts # Group-bounded drag and pending-drop placement projection
│   │   ├── RelationDrag.tsx # Independent pointer linking, clipped targeting/autoscroll, virtual source pinning and prepared keyboard-menu adoption
│   │   ├── relation-drag.css # Copy-free linking preview: connector, ports, eligible-row fading, target flow tint and adoption chip
│   │   ├── usePeriodMotion.ts # Cancellable directional content entry after data readiness; reduced-motion/visibility cleanup and overlay synchronization
│   │   ├── RowMotion.tsx  # Interruptible outer-row FLIP and finite overlay geometry updates
│   │   ├── VirtualRows.tsx # Measured heights, bounded DOM, logical keyboard traversal and focus/drag/menu pinning
│   │   ├── visibility.ts  # Post-layout title visibility in the selected current/future/past period, with pending reads and offscreen destination feedback
│   │   ├── TaskRow.tsx      # Task rows with flow dots, flow-colored checkboxes, tooltip-free titles, due indicators, description signals and flow-tinted highlights
│   │   ├── PeriodPicker.tsx # Header B: six-row year/half/cycle lists, week/day/month selection, visible history errors/retry and mode-aware labels
│   │   ├── NoteSignal.tsx   # D5 description signal under a row title and its read-only hover/focus peek (body loaded on open)
│   │   ├── TaskMenu.tsx     # Compact TODO context menu with non-redundant yearless dates, persistent source-row activation, virtual pinning, keyboard access and focus restoration
│   │   ├── FlowDot.tsx      # Role-aware flow menus, pointer linking, keyboard root adoption and hover previews without native tooltips; absent in Later
│   │   ├── RelationLines.tsx # 单流程筛选或圆点预览时的只读关系线层：按流程着色、终点落在下级圆点、跨级沿行间穿过、链高亮、滚出视野标记
│   │   ├── QuickAdd.tsx     # Explicit-period creation, per-period drafts, expired-input recovery and horizon-valid flow choices
│   │   ├── PastPeriod.tsx   # Live past-task groups with tooltip-free titles, completion/reopening/restore, guarded paging and focus retention
│   │   ├── period-labels.ts # Mode-aware adjacent/distant headings, natural Q/year lists and year-disambiguated anchored ranges
│   │   └── Backlog.tsx      # 往期分页、选择和批量安排
│   ├── items/
│   │   ├── use-item-autosave.ts # Serialized silent saves, source/receipt guards, retry and close-time draining
│   │   ├── ItemDetail.tsx   # Draft-safe details: aligned checkbox + rich title, one chip row (deadline/flow/上级/下级/拆解), full-height Markdown description, header activity drawer
│   │   ├── DetailTitle.tsx  # Unclipped shared link display, growing raw-title editor, saved-only metadata and keyboard focus handoff
│   │   ├── DuePicker.tsx    # Detail deadline trigger, shared calendar panel and focus restoration; selection/clear immediately autosaves
│   │   ├── RelationPicker.tsx # Board-ordered parent/child candidates and search matches shared by detail/flow-dot menus; longer-horizon guards and linked-first priority
│   │   ├── FlowPicker.tsx   # 详情属性行的流程标签；FlowColorMenu 为色板本体，看板圆点复用
│   │   ├── RelationChip.tsx # 详情「上级／下级」标签：弹层列出关联条目可跳转，并转入 RelationPicker
│   │   └── Activity.tsx     # 活动摘要 hook 与右侧横向抽屉，打开时才分页读取事件
│   └── setup/
│       ├── Setup.tsx        # 日历 → 年方向与确认的草稿；返回、语言变化与日期过期均保留输入
│       ├── OnboardingFrame.tsx # 左上三步进度、右上语言、居中内容列（各步标题位置一致），底部固定、无底栏样式的说明与按钮行
│       ├── DirectionStep.tsx # 年尺度方向、剩余天数/下一年提示行与两行锁定摘要；不足 14 天默认下一年，Enter 只移焦点
│       ├── CalendarStep.tsx # Welcome intro, rolling/natural cards with live dates and a year timeline, the in-card start date and a timezone/week-start sentence
│       ├── use-setup-calendar.ts # Workspace-timezone midnight/focus/wake refresh and pure calendar/year-target derivation
│       ├── TimezoneSelect.tsx # 仅可选择的时区下拉：浮层搜索、键盘选择；展开时才计算完整 GMT 偏移列表
│       └── onboarding.css   # 首次流程样式（仅 token）
├── components/              # 可跨功能使用的 UI 原语
│   ├── due-date/            # Calendar-first deadlines shared by detail/composer: localized presets, day/month navigation, keyboard focus and info guidance
│   ├── links/               # Saved-text link rendering, visible-only metadata requests, fixed-height preview cards and keyboard/swipe carousel
│   ├── description/         # Lazy Lexical Markdown/task-list editor, authored URL nodes, selection tools, safe clipboard and save/undo boundaries
│   ├── Modal.tsx            # 原生 dialog 焦点限制、Esc/背景关闭与统一页眉
│   ├── Popover.tsx          # Anchored popovers; floating panels portal to the nearest native dialog or body, retaining its focus boundary and remeasuring content/anchor size, scroll and viewport changes
│   ├── FlowMark.tsx         # 与复选框同构的流程色块
│   ├── Kbd.tsx              # 一键一帽的组合键展示（平台符号）
│   ├── LanguageSelect.tsx   # 首次配置与设置外观共用的语言下拉（语言名用各自原文）
│   ├── YearTimeline.tsx     # 当前一年的四段 3个月 / 两个半年时间轴与今天标记（首次配置模式卡与设置 › 日历共用，year-timeline.css）
│   ├── icons/index.tsx      # Explicit free Hugeicons entry, shared React icons and checklist CSS checkmark mask
│   └── ui/                 # shadcn Button, Radix Select and Context Menu; shared menu tokens and MIT attribution
├── state/
│   ├── snapshot.ts         # 按身份/内容共享未变快照分支，忽略不可见核对变化
│   ├── board-periods.ts    # Generation/selection/revision-isolated future reads, atomic return from history, transitive parent ordering and shared visible candidates
│   ├── session.ts          # 纯会话撤销成员、代次隔离、反馈去重
│   ├── flows.ts            # Board-ordered flow filters, topology/color caches and shared active graph/chain for relation lines and preview actions
│   ├── columns.ts          # Device-local Later preference; all six planning columns always shown, old planning-column preferences ignored
│   ├── relation-lines.ts   # 本机关系线开关（localStorage，默认开，只存关闭，不入工作区）
│   ├── parent-order.ts    # Device-only preference and generation/revision-bound completion of materialization
│   ├── celebration.ts      # 本机七栏撒花偏好（默认年/半年/3个月/月/周）、设置页预览与减少动态效果
│   ├── language.ts         # 语言偏好镜像：首次渲染前装载、choose 写入 main 并即时切换
│   ├── shortcuts.ts        # 本机快捷键：定义表、按物理键解析/校验/格式化、流程筛选开关、改键存储（localStorage，不入工作区）
│   ├── update.ts           # 软件更新单一 store：版本 + 阶段（首次订阅读取并监听推送，不轮询）、手动检查／重启更新、hasUpdate 红点判定
│   ├── ai.ts               # 设备侧 AI 服务状态（每服务凭据/能力/失败，每功能服务与开关）与动作（代次变化即重读）
│   ├── insight.ts          # 本机流程洞察偏好（localStorage，不入工作区）：关于我/步长/语气/关注、断点与复盘开关、引导与已复盘标记；draft/review 请求
│   ├── review-summary.ts   # Up to 24 device-local period summaries, exact-prompt fingerprints, shared requests and generation invalidation
│   ├── feedback.ts         # Command feedback policy (moves/advances are silent), committed destinations, partial-restore warnings and reading durations
│   └── use-workspace.ts    # Authoritative snapshots, post-layout feedback, completion events, session undo, reserved detail writes and receipt recovery
├── i18n/
│   ├── index.ts             # 唯一文案入口：当前语言的实时视图（原地替换，不重挂载）、setLocale/useLocale
│   ├── format.ts            # 按当前语言的 Intl 日期/星期/时间/数字格式
│   └── locales/             # zh 为源语言（messages/smart/settings/shortcuts/insight/calendar 六分册 + index），en/ja/es/fr 同构
└── lib/
    ├── colors.ts            # 八组固定配对色板、色名与流程描边值
    ├── dates.ts             # UTC day/month arithmetic, month-end clamping and weekdays; locale formatting stays in i18n/format
    ├── periods.ts           # Mode-aware relative names, natural-year/Q labels and year-disambiguated ranges shared by board/search/detail/feedback
    ├── timezones.ts         # IANA 时区的 GMT 偏移标签
    └── utils.ts             # Tailwind class 合并
```

`App → features → components / state / i18n / lib`；跨功能数据类型来自 `shared/contracts`，不从另一个功能的组件反向导入。通用 UI 不依赖 features，业务规则属于 domain/main。仅一个功能使用的组件放在该功能内，多处复用时再提升到 components。

取消/失败不乐观伪造业务结果。UndoSession 只保存已提交的用户操作 ID；历史与业务数据不复制进本地状态。详情草稿静默自动保存，失败时保留并重试；新建草稿仍需明确确认或放弃；整库代次更换销毁旧弹窗、Toast、栈与缓存。链接预览只派生显示，任务原文、版本、历史与编辑字段不受影响；卡片图片来自 main 返回的受限 raster data URL，renderer 不请求远程页面。

Descriptions keep Markdown strings in SQLite and load Lexical with the detail chunk. The editor preserves untouched source, owns local text undo, imports plain clipboard Markdown, and renders unsupported syntax inertly. Save receipts never replace newer input. Shared inline links display favicon/page-title metadata only for saved destinations; metadata never enters the document. Details omit separate link cards while board/list/history cards remain. Homepage description comparisons live only in ignored `output/prototypes/descriptions/`; production summaries still expose `hasDescription` without loading full bodies.

Detail titles read as complete, naturally wrapping rich text, matching the full-text presentation on the board. Clicking title text or its edit affordance focuses a growing raw-text field; links remain separate external actions. Editing retains authored URLs/labels, the 500-character limit, composition protection and the detail's autosave/receipt guards. Deleted titles are read-only. `DetailTitle` controls presentation/focus only; `use-item-autosave` owns draft persistence and close-time draining.

Each time column keeps dates and a contextual return/review action inline between compact arrows. Desktop titles align with row checkboxes; the previous arrow shares the flow dots' center line within the column's left gutter, with an extended hit area that avoids the title. Headings stay fixed on hover and keyboard focus. Relative headings omit years beside the name, with full dates in tooltips. Distant year/half headings and anchored picker rows add years where dates would repeat; natural years, half-years and quarters use calendar labels. Rolling three-month headings keep their existing dates. Navigation and quick add appear on column hover or header keyboard focus without layout shift; touch controls remain visible. Pointer navigation brings ready content in from the time direction over 220ms, cancelling superseded motion and synchronizing overlays. Keyboard navigation and reduced motion remain immediate. Past rows use live unfinished/completed/deleted tasks still placed in that period; completion/reopening and restore update groups without rewriting period-end history. Paging is filtered before totals and recovers from an emptied last page. Keyboard focus follows navigation and direct state changes.

`useBoardPeriods` keeps the global current snapshot separate from at most one selected future period per visible horizon. Explicit top-bar filter choices and valid filter shortcuts return all past selections to current, including repeated selections, while keeping future periods and drafts. The shortcut resolves the flow identity before navigation changes its position. Period changes reset column scroll. Responses are isolated by workspace generation, selection and revision; stale rows stay disabled until refreshed. Writes bind the displayed start date, and visibility feedback waits for this refresh. Period selections and drafts are session-only and reset with the workspace generation. Product rules and failure scenarios live in [period planning](../../docs/features/period-planning.md).

Task titles show every line, including inline links; rows grow from a 32px single-line height with 14px type, 22px text leading and a 4px clear band between row grounds. Only the first line reserves the checkbox and gap; continuation lines use the checkbox/card left edge, and the checkbox keeps its own hit target above the title. Checkboxes, flow dots, metadata, relation lines and breakpoint markers remain centered on the first line; virtual rows use the same 32px initial estimate. Past and completed tasks share this density. Breakpoint centers share the outgoing relation-port anchor at the row right edge. Incoming board dots and outgoing ports are both 6px, including hover; the dot button retains its 18px hit target. Dot previews retain their lines and breakpoint actions while pointer/focus travels through active-flow rows or breakpoint controls; plain row hover does not start a preview. Empty current target columns still allow preview next steps.

Task action menus size to content with a narrower destination submenu and pointer cursors on enabled actions. Concrete date labels omit duplicate hints. Radix's trigger open state retains the source row's active ground and flow dot while the pointer moves through the menu; closing restores its normal hover/flow state without persisting a task selection.

Column scrollbars sit at the right column boundary and appear only while that column, including its header, is hovered. Retained task focus does not keep them visible. Compensating content padding preserves task widths, wrapping and row alignment.

Under a selected flow, year TODO rows show their flow dot only on row hover, keyboard focus or while their menu is open. Checkbox alignment, other columns, completed rows and unfiltered flow previews keep their existing behavior.

Monthly review uses a todo-scale board guide and a resumable native modal with connected steps and text footer actions. `ReviewOverview` places the summary before inline period-end totals in an unfilled brief; the localized icon heading remains visible without AI. Expandable goal rows highlight on hover/focus and align markers with the title's first line. `ReviewDrawer` owns live decisions, destination drafts and guarded writes; `review.css` shares board tokens.

[PROTOCOL]: Update this header when making changes, then check README.md.
