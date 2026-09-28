# renderer/

> 父级：[项目地图](../../docs/development.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 首屏看板、按需加载配置/弹窗、全局快捷键与反馈；composer 首次打开后按工作区代次保留草稿
├── main.tsx                 # React 挂载
├── index.html               # 本地页面；生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind, theme tokens, board/dialog/menu layout, column action visibility, scrollbars and accessibility
├── features/                # 按用户功能聚合页面及其专属组件
│   ├── shell/               # 应用外壳：常驻顶栏及其打开的全局弹窗
│   │   ├── TopBar.tsx       # 可拖动顶栏：流程筛选、搜索、列显示勾选浮层、设置
│   │   ├── CommandPalette.tsx # Debounced search with actual-period hints, commands and detail navigation
│   │   ├── CompletionCelebration.tsx # Exact-corner Canvas bursts with a broad viewport-scaled fan; nonmodal top layer, reduced motion and generation cleanup
│   │   ├── FeedbackLayer.tsx # Nonmodal feedback layer inside the active native dialog, preserving focus and usable Toast actions
│   │   ├── completion-celebration.css # 装饰画布和 backdrop 的全窗口透明、指针穿透样式
│   │   └── settings/        # 左侧三组导航（偏好/工作区/条目）+ 页头说明 + 分组卡片的设置弹窗；外观含语言
│   │       ├── Settings.tsx     # 容器：分组导航与状态提示、页头（说明/恢复默认/结束方式）、备份/批次/数量读取、数据动作与预览状态
│   │       ├── AppearancePane.tsx # Language, visual styles, theme and device relation-line switch
│   │       ├── BoardPane.tsx      # Device parent-order switch, atomic disable/materialization and per-column completion-confetti preview
│   │       ├── ShortcutsPane.tsx # 快捷键：通用组点键帽录制、冲突警告与清除；流程筛选开关 + 位置示意
│   │       ├── SmartPane.tsx    # 智能输入：状态卡、服务单选列表（Key 更换/删除，表单在行下展开）、隐私要点
│   │       ├── InsightPane.tsx  # 洞察：断点/复盘开关与引导重看、关于我（本机）、拆解步长与补充、复盘语气与关注、试一试（不写入）与只读完整提示词
│   │       ├── CalendarPane.tsx # 三栏只读日历、逐列顺延策略（说明随选择变化）、可撤销的顺延记录
│   │       ├── BackupPane.tsx   # 备份与恢复：状态/每日开关/保留份数、备份列表、导出与单一文件恢复、危险区重置
│   │       ├── ItemsPane.tsx    # 条目：已完成/已取消/已归档/回收站的搜索、今天/昨天分组与行内还原
│   │       ├── TransferReview.tsx # 三步进度与整库替换的两阶段确认
│   │       ├── parts.tsx        # 分组/行（可带整行下方控件）/分段选择（色块、数量）/多选按钮组/开关原语，工作区时区时间与相对日期
│   │       └── settings.css     # 设置弹窗专属样式（仅 token）
│   ├── composer/            # 全局新建：输入法式（输入 → 一条 Jev 推荐 → ↵ 创建 / Tab 调整 / ⌥↵ 原样存 Later）
│   │   ├── Composer.tsx     # 输入/防抖/IME、修订回声、候选条各状态、↵/Tab/⌥↵ 与调整列表键位、失败降级、会话草稿与 createPlan 确认
│   │   ├── Plan.tsx         # 推荐的只读呈现（单件一句话、多件一行一件）、拿不准的「可能…」旁注、Jev 标记
│   │   ├── DraftRow.tsx     # 调整行：选中时行内 T/D/P 标签与菜单（列、截止、上级与新流程颜色）、M 合并、E 改标题说明
│   │   ├── KeyMenu.tsx      # 行内菜单的键盘外壳：↑↓ 移动、数字直选，Esc 交给 Popover
│   │   ├── suggestions.ts   # 纯函数：上级关联与移列规则、片段合并、Jev 拿不准的判断（doubts）
│   │   ├── draft.ts         # 纯草稿模型：手动优先合并、推测列、orphan、计划负载与本地复核
│   │   ├── Seeded.tsx       # Context-prefilled create / insertBetween / checked createPlan; one batch request across effect replay, typed-text precedence and visible manual fallback
│   │   └── composer.css     # composer 与连接表单样式（仅 token）
│   ├── insight/             # 流程洞察（docs/features/flow-insight.md）
│   │   ├── signals.ts       # 纯信号：单流程断点（缺口/跳级，只提示最近一级、目标列为空时让位给空列卡）、空列、目标周期（最后一天→下一期）、发给模型的有界中文看板
│   │   ├── Breakpoints.tsx  # 单流程筛选时骑在列分隔线上的 ＋ 层（流程色/跳级橙色）、去向标记、一次性引导
│   │   ├── decompose.ts     # 「拆下一步」唯一写入路径：模型起草后 create / insertBetween，⇧ 或无模型时打开预填新建（断点与右键共用）
│   │   ├── EmptyCard.tsx    # 空列卡：为上一列各起一步（批量预填）或自己写
│   │   ├── review.ts        # 复盘纯规则：入口（最后一天 / 次日一次，周月同日合并）、目标×周期、信号、排下一期候选
│   │   ├── ReviewDrawer.tsx # Review → wrap up → plan month/week → finish; period-scoped writes and a cached summary card
│   │   ├── ReviewSummary.tsx # Context-aware summary loading, manual refresh, retained results on failure and retry feedback
│   │   └── insight.css      # 断点、引导、空列卡、复盘入口与抽屉样式（仅 token）
│   ├── smart/
│   │   ├── JevConnect.tsx   # 服务单选、Key、同意、测试并启用（Onboarding/设置共用；提交按钮可渲染到底栏）
│   │   ├── JevDemo.tsx      # 不调用服务的预设示例动画：逐字输入 → 整理中 → 草稿卡
│   │   └── JevStep.tsx      # 首次流程第 3 步：先看示例，选择连接才填 Key，通过或跳过都进入看板
│   ├── board/
│   │   ├── Board.tsx        # Unified past/current/future navigation, period-bound drafts/drop targets and preserved navigation focus
│   │   ├── useBoardDrag.ts # Group-bounded drag and pending-drop placement projection
│   │   ├── usePeriodMotion.ts # Cancellable directional content entry after data readiness; reduced-motion/visibility cleanup and overlay synchronization
│   │   ├── RowMotion.tsx  # Interruptible outer-row FLIP and finite overlay geometry updates
│   │   ├── VirtualRows.tsx # Measured heights, bounded DOM, logical keyboard traversal and focus/drag/menu pinning
│   │   ├── visibility.ts  # Post-layout title visibility in the selected current/future/past period, with pending reads and offscreen destination feedback
│   │   ├── TaskRow.tsx      # Task rows with flow dots, flow-colored checkboxes, titles, due/description indicators and flow-tinted highlights
│   │   ├── TaskMenu.tsx     # Grouped TODO context menu: next period / move to… (upcoming periods), next step / link a parent, complete / delete; keyboard access and focus restoration
│   │   ├── FlowDot.tsx      # 复选框前的流程圆点：起点改色、下级改上级、独立条目二选一；悬停预览流程；Later 不显示
│   │   ├── RelationLines.tsx # 单流程筛选或圆点预览时的只读关系线层：按流程着色、终点落在下级圆点、跨级沿行间穿过、链高亮、滚出视野标记
│   │   ├── QuickAdd.tsx     # Explicit-period creation, per-period drafts, expired-input recovery and horizon-valid flow choices
│   │   ├── PastPeriod.tsx   # Live past-task groups, completion/reopening/restore, guarded paging and focus retention
│   │   ├── period-labels.ts # Relative adjacent headings, date-only distant/cycle headings and year-free dates shared with setup
│   │   └── Backlog.tsx      # 往期分页、选择和批量安排
│   ├── items/
│   │   ├── ItemDetail.tsx   # Draft-safe details, focus-preserving completion, actual-period locating, lifecycle/relations and moves back to current
│   │   ├── DuePicker.tsx    # 截止日快捷选项与日期输入
│   │   ├── RelationPicker.tsx # Board-ordered parent/child candidates and search matches shared by detail/flow-dot menus; longer-horizon guards and linked-first priority
│   │   ├── FlowPicker.tsx   # 详情标题前的流程色点；FlowColorMenu 为色板本体，看板圆点复用
│   │   └── Activity.tsx     # 按真实事件序列分页查看活动
│   └── setup/
│       ├── Setup.tsx        # 首次流程前两步的状态：方向草稿 → 日历确认
│       ├── OnboardingFrame.tsx # 三步进度、语言、固定底栏（主按钮统一在右下）
│       ├── DirectionStep.tsx # 写下三个月的方向（示例可填入），确认前只存草稿
│       ├── CalendarStep.tsx # 一句话三胶囊（时区/周起始/3个月起点）与剩余天数，显式确认锁定日历
│       ├── BoardPreview.tsx # 真实列头与空状态的只读预览，方向以「待确认」行放进 3个月
│       ├── TimezoneSelect.tsx # 仅可选择的时区下拉：浮层搜索、键盘选择；展开时才计算完整 GMT 偏移列表
│       └── onboarding.css   # 首次流程样式（仅 token）
├── components/              # 可跨功能使用的 UI 原语
│   ├── links/               # Saved-text link rendering, visible-only metadata requests, fixed-height preview cards and keyboard/swipe carousel
│   ├── Modal.tsx            # 原生 dialog 焦点限制、Esc/背景关闭与统一页眉
│   ├── Popover.tsx          # 锚点浮层，外部按下/Esc 关闭且不关闭外层弹窗；floating 经 portal 浮出滚动容器
│   ├── FlowMark.tsx         # 与复选框同构的流程色块
│   ├── Kbd.tsx              # 一键一帽的组合键展示（平台符号）
│   ├── LanguageSelect.tsx   # 首次配置与设置外观共用的语言下拉（语言名用各自原文）
│   ├── icons/index.tsx      # 唯一 Hugeicons 免费显式导入入口
│   └── ui/                 # shadcn Button, Radix Select and Context Menu; shared menu tokens and MIT attribution
├── state/
│   ├── snapshot.ts         # 按身份/内容共享未变快照分支，忽略不可见核对变化
│   ├── board-periods.ts    # Generation/selection/revision-isolated future reads, atomic return from history, transitive parent ordering and shared visible candidates
│   ├── session.ts          # 纯会话撤销成员、代次隔离、反馈去重
│   ├── flows.ts            # Board-ordered flow filters and shortcuts; topology/color caches survive row reordering, unrelated items share empty results
│   ├── columns.ts          # 本机列显示偏好（localStorage，至少一列，不入工作区）
│   ├── relation-lines.ts   # 本机关系线开关（localStorage，默认开，只存关闭，不入工作区）
│   ├── parent-order.ts    # Device-only preference and generation/revision-bound completion of materialization
│   ├── celebration.ts      # 本机逐列撒花偏好（默认周/月/3个月）、设置页预览信号与系统减少动态效果订阅
│   ├── language.ts         # 语言偏好镜像：首次渲染前装载、choose 写入 main 并即时切换
│   ├── shortcuts.ts        # 本机快捷键：定义表、按物理键解析/校验/格式化、流程筛选开关、改键存储（localStorage，不入工作区）
│   ├── smart.ts            # 设备侧智能输入状态与动作（代次变化即重读）
│   ├── insight.ts          # 本机流程洞察偏好（localStorage，不入工作区）：关于我/步长/语气/关注、断点与复盘开关、引导与已复盘标记；draft/review 请求
│   ├── review-summary.ts   # Up to 24 device-local period summaries, exact-prompt fingerprints, shared requests and generation invalidation
│   ├── feedback.ts         # Command feedback policy, committed destinations, partial-restore warnings and reading durations
│   └── use-workspace.ts    # Authoritative snapshots, post-layout feedback, completion events, session undo and receipt recovery
├── i18n/
│   ├── index.ts             # 唯一文案入口：当前语言的实时视图（原地替换，不重挂载）、setLocale/useLocale
│   ├── format.ts            # 按当前语言的 Intl 日期/星期/时间/数字格式
│   └── locales/             # zh 为源语言（messages/smart/settings/shortcuts/insight 五分册 + index），en/ja/es/fr 同构，缺键即类型错误
└── lib/
    ├── colors.ts            # 八组固定配对色板、色名与流程描边值
    ├── dates.ts             # 纯日历日加减与月末（本地化格式在 i18n/format）
    ├── periods.ts           # Previous/current/next/concrete destination names and absolute date ranges shared by board, search, details and feedback
    ├── timezones.ts         # IANA 时区的 GMT 偏移标签
    └── utils.ts             # Tailwind class 合并
```

`App → features → components / state / i18n / lib`；跨功能数据类型来自 `shared/contracts`，不从另一个功能的组件反向导入。通用 UI 不依赖 features，业务规则属于 domain/main。仅一个功能使用的组件放在该功能内，多处复用时再提升到 components。

取消/失败不乐观伪造业务结果。UndoSession 只保存已提交的用户操作 ID；历史与业务数据不复制进本地状态。未保存草稿保留到明确保存或放弃；整库代次更换销毁旧弹窗、Toast、栈与缓存。链接预览只派生显示，任务原文、版本、历史与编辑字段不受影响；卡片图片来自 main 返回的受限 raster data URL，renderer 不请求远程页面。

Each time column keeps dates and a contextual return/review action inline between compact arrows. Header dates omit years, with absolute dates in tooltips; distant periods and non-current three-month cycles use the date itself as the heading. Navigation and quick add appear on column hover or header keyboard focus without layout shift; touch controls remain visible. Pointer navigation brings ready content in from the time direction over 220ms, cancelling superseded motion and synchronizing overlays. Keyboard navigation and reduced motion remain immediate. Past rows use live unfinished/completed/deleted tasks still placed in that period; completion/reopening and restore update groups without rewriting period-end history. Paging is filtered before totals and recovers from an emptied last page. Keyboard focus follows navigation and direct state changes.

`useBoardPeriods` keeps the global current snapshot separate from at most one selected future period per visible horizon. Explicit top-bar filter choices and valid filter shortcuts return all past selections to current, including repeated selections, while keeping future periods and drafts. The shortcut resolves the flow identity before navigation changes its position. Period changes reset column scroll. Responses are isolated by workspace generation, selection and revision; stale rows stay disabled until refreshed. Writes bind the displayed start date, and visibility feedback waits for this refresh. Period selections and drafts are session-only and reset with the workspace generation. Product rules and failure scenarios live in [period planning](../../docs/features/period-planning.md).

Column scrollbars sit at the right column boundary and appear only while that column, including its header, is hovered. Retained task focus does not keep them visible. Compensating content padding preserves task widths, wrapping and row alignment.

Under a selected flow, cycle TODO rows show their flow dot only on row hover, keyboard focus or while its menu is open. Checkbox alignment, other columns, completed rows and unfiltered flow previews keep their existing behavior.

[PROTOCOL]: Update this header when making changes, then check README.md.
