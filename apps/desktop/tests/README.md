# tests/

> 父级：[项目地图](../../../docs/development.md)。Vitest 层（`domain/`、`main/`、`renderer/`、`integration/`）和真实 Electron 场景放在一起。加密构造测试在 `packages/crypto/test`，跨包同步测试在 `packages/tests/sync`。从仓库根用 `pnpm test` / `pnpm test:*`；直接跑某个场景时工作目录是 `apps/desktop`，证据写到本目录下的 `output/tests/`（仓库路径 `apps/desktop/output/tests/`）。

```text
apps/desktop/tests/
├── domain/
│   ├── calendar.test.ts     # 时区、DST、午夜、自然月与跨年周
│   ├── calendar-modes.test.ts # Rolling/natural 12/6/3-month boundaries, nesting, DST and six-horizon schemas
│   ├── calendar-phrases.test.ts # Injected-clock Chinese year/half phrases at half-year/year boundaries
│   ├── flows.test.ts        # 多父 DAG 上的流程根归属与去重
│   └── smart.test.ts        # weekStart 1–7 日期、槽位、K×d 概率容差、64 题预算、预览组装与计划拓扑
├── main/
│   ├── security.test.ts     # 本地协议路径约束与 CSP 静态约束
│   └── smart.test.ts        # 三渠道请求形状/路由/精度、错误归类、凭据与代次门控、取消/冷却/缓存（fixture，非真实服务）
├── renderer/
│   ├── session.test.ts      # 会话去重、非栈顶/冲突单项移除、代次隔离
│   ├── colors.test.ts       # 八组浅/深色对比度、流程描边与拼色
│   ├── review.test.ts       # Seven week starts, timezone/DST boundaries, weekly retention, monthly overlap and generation-scoped persistent dismissal
│   └── draft.test.ts        # composer 手动优先合并、orphan、计划负载与本地复核
├── integration/
│   ├── database.test.ts     # 实际 SQLite 副本的失败保留与悬空引用拒绝
│   ├── commands.test.ts     # 首次确认、DAG 周期规则、库级防环和中文搜索
│   ├── calendar-modes.test.ts # Stale setup, manual year/half, six-horizon writes/review, order materialization/undo/restart and round trips
│   ├── history.test.ts      # 周期成员/期末/后来结果、分页、批量往期与回拨
│   ├── reconcile.test.ts    # 自动策略边界、批次部分撤销、排除、hold 与暂停
│   ├── transfer.test.ts     # JSON/SQLite、保护备份、维护、原子替换故障与 baseline
│   ├── flows.test.ts        # 流程颜色唯一/根约束、还原与撤销冲突、旧数据导入
│   ├── plan.test.ts         # createPlan 拓扑/入边归属/同代次撤销还原闭环/跨代次 JSON·SQLite 恢复/伪造导入
│   ├── startup.test.ts      # Read-only v1–v5 refusal without copies or byte changes, including uncheckpointed WAL
│   └── undo.test.ts         # 生命周期、效果撤销/冲突、原始时间与 hold
└── （Electron 场景与 fixtures/，见下方清单）
packages/crypto/test/        # 加密构造与 parity
packages/tests/sync/         # 跨包同步；workspace 包只提供 @goalloom/* 链接
```

`pnpm test` 使用锁定 Electron 自带的 Node 运行全部 Vitest 测试（桌面层、加密构造、跨包同步）；`test:domain` 只运行纯领域层，`test:integration` 运行 SQLite 集成测试（保留 `test:repository` 别名）。不要用 `npx vitest`：系统 Node 没有原生 Temporal。临时工作区由测试创建并清理，不访问用户任务。桌面自动化独立运行，正式应用没有测试 IPC 或时钟控制口。

`weekly-review.mjs --outline` compares real current-board order for equivalent task groups with review closing. `review-scopes.mjs --outline` covers monthly period-end records and closing outside calendar-entry windows. Both use `fixtures/review-outline.mjs` with real SQLite history, overlapping sibling sort keys and an independently completed parent; four-appearance screenshots and JSON reports are in `output/tests/review-outline/{weekly,month}/`. These selectors do not replace the owning feature coverage.

`sync-review.mjs` runs `sync-review/cases.ts` against production service/SDK/SQLite with encrypted peers. `sync-review-native.mjs` uses `sync-review/native-entry.ts` around the existing isolated native composition to cover selection-only task groups, five languages, failure retention, lost-reply receipt recovery and direct Finish close. Evidence is in `output/tests/sync-review/`; root entry: `pnpm test:sync-review`. Product rules and predeclared failure cases are in `docs/sync/desktop.md`.

`apps/desktop/tests/main/smart.test.ts` 只用受控 fixture 验证请求/响应契约，不代表各渠道真实 Key 已联调。纯函数与集成测试通过不表示打包桌面、Windows 安装、IME 或睡眠验收通过。实际命令、运行版本和平台范围记录于开发提交/PR。

`pnpm test:calendar` includes six ordered policy controls in both calendar modes, automatic/manual save and process restart, all five locales and four themes. `fixtures/rollover-policies.ts` exercises the production Repository and SQLite with injected boundary clocks; `calendar-seed.ts` covers frozen v5/v6 JSON/SQLite import and v7 round trips, including historical multi-effect receipts from `fixtures/legacy-milestone.ts`, malformed-effect rejection, preserved undo history and old-generation undo rejection after restore. Repeatable evidence is in `output/tests/calendar-modes/` (`report.json`, `rollover-report.json`, `legacy-report.json` and policy screenshots).

```text
Electron scenarios (this directory)
├── style-migration.mjs  # 68 four-appearance setup/settings/menu/composer snapshots, computed geometry/styles and keyboard/portal/no-write checks; --record before a styling change, --compare after rebuilding; output/tests/style-migration
├── calendar-modes.mjs   # Rolling/natural setup, short annual target/future half drafting, Settings › Calendar next starts and the change-calendar route to reset, six pickers, longest-parent dragging, legacy JSON/SQLite fidelity and five-locale/four-theme evidence; output/tests/calendar-modes
├── later-sidebar.mjs    # Default planning columns, legacy preference handling, Later count and parent unlinking on moves, independent scrolling, drag/undo, preserved drafts, motion, themes/locales and restart; output/tests/later-sidebar
├── column-visibility.mjs # Six-column checkbox menu sized to the longest label, right-aligned checks, gray locked check with a hover tip, independent preferences, retained hidden drafts/scroll/periods, explicit-target reveal, keyboard drag, geometry/locales/themes; --menu narrows development checks, --baseline/--style-baseline preserve initial failures; output/tests/column-visibility
├── sqlite.mjs           # 单独构建/启动真实 main 的内置 SQLite 探针
├── sync-replay.mjs      # Encrypted two-peer duplicate relationship replay, pending receipts, atomic rejection and storage retry; synthetic remote, Electron SQLite; output/tests/sync-replay/
├── workspace.mjs        # 看板业务、实际流程候选的详情关联、单面板详情／顶部操作按钮／窄窗口（fixtures/detail-rail.mjs）、流程筛选快捷键与设置、协议/CSP/IPC、主题与窄窗口
├── task-focus.mjs       # Pointer/Escape/close and keyboard detail-focus returns, plain/rich titles, four themes and no task writes; output/tests/task-focus/
├── history.mjs          # Live past-task editing/groups, filter return to current, paging recovery, focus/feedback, immutable history, backlog/hold and replacement isolation; history.json and history/past-task screenshots
├── periods.mjs          # Compact TODO menus with source-row activation/cursors, unified period navigation, editable future periods, cross-period drafts, sorting, undo, future search/details and explicit navigation, five-language header geometry and restart; app-local input/focus failure diagnostics in output/tests/periods
├── month-review.mjs    # Period-end records, live closing, unified guide, resume and exact planning destinations, partial failures and receipt recovery; --combined adds fresh month → week planning; output/tests/insight/{month-review,combined-review}/
├── review-scopes.mjs # Native component-only month/combined audit outside App entry eligibility; records, closing, proposals and completion callback; combined skips after the month-start week expires; output/tests/review-scopes/
├── weekly-review.mjs   # First/last-day retention of the previous-week guide, persistent dismissal/focus without writes or completion, current-week closing destinations, compact read-only rows, two-parent hierarchy/colours/joined marker-centred lines, compact gap/intrinsic destination dropdowns with keyboard/focus dismissal/separators, skip versus linked creation, automatic completion/entry suppression distinct from planning invitations, resume and post-review creation; --completion selects receipt/confetti acceptance; included by insight.mjs; output/tests/insight/weekly-review/
├── insight.mjs          # Native flow insight; --empty-card selects weekly/daily labels/equal-height hit targets, batch/manual creation and empty-card-layout; full mode retains previews/undo/geometry/reviews/settings and weekly-review
├── empty-card-layout.mjs # Five-locale single-row return icons/pointer-keyboard hints, scoped Escape, 44px touch controls and same-row empty actions at 320px; --return-icons writes output/tests/period-return, --baseline records failures; default output/tests/empty-card-layout
├── insight-generation.mjs # Compact AI services via fixtures/ai-services.mjs (official offline logos, four appearances, icon hints, add/replace and removal confirmation); development/production Electron: held next-step success/failure requests with loading rotation/colour/reduced-motion, completion/manual fallback, drafting, Settings trial captures and summary persistence/restart/refresh/invalidation/failures/reset; real bridge/storage and synthetic HTTP; output/tests/insight/generation/
├── insight-live.mjs     # Authorized real OpenRouter: annual → half → cycle drafts, Settings trial/no writes, seven weekly drafts and review summary; outside verify
├── recovery.mjs         # 保护备份/维护/重置/SQLite 恢复与重启暂停
├── composer-live.mjs    # 可选：真实 OpenRouter Jev（需 .env.local Key）连接、默认采用 Jev 的上级推荐、↵ 创建并核对看板/关联/说明，截图作证据；不进 verify
├── composer.mjs         # Setup, compact empty composer, measured input/dialog growth/shrink, drafts without entry guidance, header keyboard paths and split; includes fixtures/column-add.mjs and inline-nesting.mjs for seven-column blank/tail creation, Tab/Shift+Tab nesting, retained caret/flow/period drafts, failed/late/lost replies, one-step undo/restore, title wrapping/growth/shrink/resize, paste/IME, guards, title/input alignment, inactive header Add, virtual lists and locales/themes; --column-add selects it; output/tests/column-add/, composer.json and screenshots/composer-*.png
├── due-dates.mjs        # Deadline capsules/calendar: real Electron draft/save boundaries, leap/month/week keyboard navigation, first-level hover/focus guidance with or without a date, six row states, five locales and paper/minimal in light/dark; output/tests/due-calendar/
├── performance.mjs      # Release-only: 真实规模性能基准（500历史+200活跃）、存储延迟与窗口启动/内存
├── startup.mjs          # 隔离空看板/100 条目的三次启动与自然空闲内存、按需弹窗和会话草稿证据
├── credentials.mjs      # Startup/Settings without cipher access, keychain-independent sign-out/reconnect and write failure, sign-in/session/AI restoration, five-language password recovery, denied-access OAuth, access-restored restart and corrupt-file preservation and missing-native fail-closed startup; synthetic cipher/cloud, real IPC/SQLite; output/tests/credentials/
├── keychain-native.mjs  # Real macOS Security: private-keychain first-use/restart and silent lock/identity rejection, plus unprovisioned Data Protection rejection; output/tests/keychain-native/
├── keychain-package.mjs # Optional local ad-hoc package outside the checkout: native ASAR unpack/sign/load, first use/restart/lock and cleanup; no production signing/notarization; output/tests/keychain-package/
├── keychain-signed.mjs # Hosted Developer ID gate: Data Protection key persistence across process restart and signed bundle replacement, plus safeStorage/1.9.1 AI restoration; output/tests/keychain-signed/
├── relations.mjs        # Relation lines/dots, geometry and board-ordered filters; --flow-dot selects parent-panel headings/search/checked links and positioning; full mode retains moves/undo/shortcuts/reload and gesture acceptance
├── relation-drag.mjs    # Native flow-valid parent/child search, colorless rejection, root promotion/adoption/undo, receipt recovery, ordering, clipped autoscroll and five locales; output/tests/relation-drag
├── language.mjs         # System language, setup/settings switching, 720/1280px single-line settings navigation (real paused state with synthetic credentials, localized icons and no service/backup/trash metadata) and content-sized review choices, main/worker copy, persistence, flow/detail menus and reviews; five-locale screenshots and output/tests/language.json
├── feedback.mjs         # Contextual success Toasts, keyboard undo, duration/hover/focus, original restore destination and flow-valid partial-restore warnings; feedback.json and feedback-*.png
├── link-previews.mjs    # Link text, full-width cards under overlay controls, cached previews, carousel gestures, external opening, unchanged legacy records and five locales; output/tests/link-previews/
├── descriptions.mjs     # Native Lexical Markdown/task lists, source preservation, clipboard, formatting, save receipts and length guards; output/tests/descriptions/
├── subtasks.mjs         # Native whole-group previews/ordered insertion, cancel/focus, quiet drag/menu nesting and receipt recovery, keyboard undo feedback, details without redundant ownership properties, complete-group status, future search, virtual details and five locales; --data selects transaction/recovery fixtures; --drops selects group-drop scenarios; output/tests/subtasks/
├── ordering.mjs         # Local placement/free manual ordering/scoped arrangement (--auto-placement), 12 edge drops (--edge-sorting), transaction regressions and full-source parent-placement runner; output/tests/ordering
├── parent-placement.mjs # Source startup preference migration/precedence, immediate toggles, manual/backlog group placement and restart; output/tests/parent-placement
├── completed-layout.mjs # Default-inline seven-column completion/reopen/undo, folds, restart, remote deferral/no echo, mixed drag/flows, outlines, future periods, virtual focus and five-locale/four-appearance evidence; output/tests/completed-layout/
├── celebration.mjs      # 完成撒花逐列按钮偏好/重启、看板移动后的目标列偏好、设置页预览、真实双角起点与大小窗口四分区覆盖、详情动效、静默完成/撤销及清理（celebration.json 与截图）
├── updates.mjs        # Settings › About: menu routing/re-targeting, real version and icon, update phases via the production event, top-bar/nav dots, menu relabelling; output/tests/updates/
├── update-install.mjs # Optional macOS: signed 90.0.0 app + 90.0.1 zip/latest-mac.yml on a 127.0.0.1 feed; UI check → native staging before ready → immediate quit/install, retained failure evidence; outside verify
├── dialogs.mjs          # 操控真实原生保存/打开对话框的验收入口，保存 JSON 证据和恢复后截图
├── review/              # 已确认缺陷、输入/维护竞态、长列、wire、增长曲线和大备份回归
└── fixtures/
    ├── sync-replay.ts    # Two isolated repositories, encrypted ordered nesting/undo, duplicate-link replay, atomic conflicts and storage retry
    ├── sync-creation-placement.ts # Committed ready/late/future creation order, explicit positions, live root anchors and topological plans through pending/canonical replay and undo/restore
    ├── sync-rollover-placement.ts # Encrypted automatic/manual/backlog arrival positions, source-local groups, immutable receipts, guarded failures and root-first group undo
    ├── sync-sort-gaps.ts # Deterministic root/sibling gap exhaustion, preserved placement order and semantic undo after normalization on encrypted peers
    ├── setup.mjs        # Shared welcome local-use choice, then real calendar → annual direction → AI setup; optional mode/timezone/week-start/anchor
    ├── credential-entry.mjs # Pre-main cipher call counting, synthetic cloud/browser transport and disabled system protocol registration for isolated credential scenarios
    ├── session-key.ts  # Synthetic profile-scoped native session key for isolated sync UI fixtures; production encryption/files remain active
    ├── keychain-entry.mjs # Source app entry loading the private native probe; startup policy stays owned by production code
    ├── keychain-native.m # CLI and test-only Node-API private-keychain probe; refuses access if production leaves UI enabled, never packaged
    ├── completed-layout.mjs # Localized native settings driver for explicit inline/folded completion coverage
    ├── legacy-v5.ts     # Frozen v5/v6 DDL used only to construct synthetic legacy import fixtures
    ├── subtasks-data.ts # Two-level/effective graph, atomic sibling insertion, group order/movement/hold, bounded inherited AI context, scoped undo, source-aware import and protected v8 upgrade
    ├── nesting-drops.mjs # Native child hit zones, whole-group geometry, checkbox-aligned first/middle/last insertion, full-width root markers, atomic today root-edge detachment/undo, receipt recovery, future/Later groups and unmounted-root clipping
    ├── edge-sorting.mjs # Native before/after insertion previews, 12 manual/automatic adjacent-row drops, cancellation and undo
    ├── drag-titles.mjs # Retained pointer/keyboard wrapping of raw URLs and 500-character titles, with no-write cancellation
    ├── auto-placement.mjs # Native header/tail create and link placement, free pointer/keyboard sorting, one-shot arrange/undo/recovery, usable nesting and five locales
    ├── ordering-seed.ts # Production ordering transaction runner and native board seed; includes hidden-group and rollover regression fixtures
    ├── ordering-hidden-groups.ts # Archived/cancelled root eligibility/anchors, local versus remote children, atomic link/unlink undo, rollback and current/future scope
    ├── rollover-placement.ts # Automatic/manual/backlog on/off placement, source-order batches, explicit slots, local groups, receipt anchors, stale writes and expired-period undo holds
    ├── parent-placement-seed.ts # Injected-clock expired/current/future groups for startup and native manual/backlog placement in synthetic profiles
    ├── capture-placement.mjs # Bottom-entry ready/late Jev placement, captured on/off policy, preserved older rows/drafts and one-step creation undo/restore
    ├── calendar-seed.ts # Legacy holds/history/undo/plan fidelity, read-only startup refusal, manual policy defaults, v7 round trips and pre-anchor review guards
    ├── rollover-policies.ts # Six-policy defaults, rolling/natural month-end/leap boundaries, eligibility, stale writes, undo holds and JSON/SQLite round trips
    ├── calendar-history.ts # Recorded year/half/cycle counts, earlier periods and reversed half/cycle parent groups for native restart acceptance
    ├── celebration-visibility.mjs # 原生窗口隐藏验证：独立 Electron + 无前台模拟的 CDP，确认真实 visibility 与动效释放
    ├── sqlite-probe.ts  # Electron main 的驱动/事务/恢复探针
    ├── review-seed.ts   # Injected-clock previous-week/monthly/combined history, first/last-day calendars, provider caching and five-locale review fixtures
    ├── review-drafts.mjs # Native held close/reopen, edited/excluded suggestions, local remount cache, input/preference invalidation and failed-cache recovery; insight-generation.mjs
    ├── review-completion.mjs # Native auto-close, immediate/persistent entry removal, rejected/lost writes, skip and real Canvas confetti/motion/column guards; weekly-review.mjs --completion
    ├── review-invitation.mjs # Shared review/planning card styles/current dates, keeping previous-week items in place, absent completion notes after close/reload and retained linked creation; weekly-review.mjs --invitation; output/tests/review-invitation/
    ├── review-scopes/ # Test-only native renderer mounting production month/combined components with explicit period props and real preload/main/SQLite; no authoritative clock override
    ├── review-draft-focus.mjs # Borderless focused review draft, editing/Tab and retained choices; weekly-review.mjs --draft-focus; output/tests/review-draft-focus/
    ├── history-seed.ts  # 正式事务生成历史样本，无生产测试时钟
    ├── past-period-editing.mjs # Native past-task editing, completion/reopening, restore, move/undo, focus, query guards and last-page recovery
    ├── filter-navigation.mjs # Top-bar/shortcut return from history, flow identity, input guards, scroll reset and future-draft retention
    ├── periods-seed.ts  # Production Repository/SQLite clock-boundary, atomicity and recovery assertions plus the planning UI fixture
    ├── period-navigation.mjs # Current month/week countdown badges in the trailing add slot and stable column-hover/keyboard swaps, title/checkbox alignment across idle/hover/focus, inline/date-only dates and year-boundary tooltips, contextual return labels, paused motion frames and reduced-motion acceptance
    ├── link-preview-cache.mjs # Fresh production preview-cache records and locally generated PNG; no renderer API replacement
    ├── favicon-transport.mjs # Real preview IPC with deterministic HTTP/DNS fixtures: declared/fallback raster/ICO icons and unsafe/oversized/malformed responses
    ├── poll.mjs         # pollPage：轮询 renderer 里的异步桥接读取（page.waitForFunction 会把 async 谓词的 Promise 当作真值立即返回）
    ├── preview-breakpoints.mjs # Labelled, full-row-centered childless-parent actions with title growth/shrink geometry, direct week/day-child preservation, retired-write rejection, ancestor/sibling switching, hover/focus retention, empty targets, multi-flow deduplication, creation and undo; called by insight.mjs
    ├── detail-rail.mjs   # Permanent activity calendar, visible lifecycle actions, native hit testing and no item writes at wide/narrow sizes in four themes; output/tests/detail-rail
    ├── detail-discard.mjs # Native empty-title close/undo, content/lifecycle guards and failed/unknown/racing writes; autosave.mjs --discard
    ├── discard-data.ts  # Production discard transactions, past-period holds, atomic guards, five locales and JSON/SQLite recovery; output/tests/autosave/discard/
    ├── flow-dot-position.mjs # Heading-only parent panels/checked links, intrinsic choice width, explicit bottom-edge clearances, mode/search size changes and scroll/resize geometry; focused via relations.mjs --flow-dot
    ├── relation-drag-data.ts # Production Repository/SQLite flow-policy guards, promotion/adoption rollback, receipts, branch-safe undo and durable JSON/SQLite round trips under Electron
    ├── relation-visibility.mjs # Raw Electron/CDP native hide/show cancellation without foreground emulation; called by relation-drag.mjs
    └── performance.ts   # Release-only: 500历史/200活跃的真实规模基准，测恢复与延迟
```

按[功能测试映射](../../../docs/development.md#测试范围)从仓库根选择脚本：完成一次改动只需本次场景与所属功能的全部 E2E，命令去重；这里的成员清单不是每次必须全部执行的清单。Onboarding 专门覆盖位于 `workspace.mjs`、`composer.mjs`、`language.mjs`、`calendar-modes.mjs`，跨午夜场景位于 `review/renderer.mjs`；其他脚本仅经过向导初始化不算相关覆盖。Review 回归按所需分组调用 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs <group>`，不默认运行所有分组。**全量 `pnpm verify` 和性能测试（`test:performance`、`test:scaling`）只在发布前或明确要求时运行，不作为日常功能开发的必要条件。**

同机操作引起的失焦／遮挡按[桌面测试干扰](../../../docs/development.md#桌面测试干扰)处理：先确认原因，不自动增加失焦用例或等待／重试；消除已确认的环境干扰后只补跑最小范围一次。新增回归必须有产品契约或受控复现依据，现有真实焦点与可见性需求继续保留。

History, periods, ordering, relations and link-preview setup only sizes the native window; it does not add `show()`, `focus()`, `app.focus()` or `bringToFront()` calls. Relations uses the actual native viewport and a non-draggable top-bar button when moving the pointer away from the board. Keep the existing input, wheel, drag, screenshot and restart assertions. In-app element focus remains part of keyboard coverage. Native refocus in the Review reconciliation check and hide/show in the celebration visibility fixture exercise explicit behavior. The production app still shows its window on startup, so this is reduced activation, not headless acceptance.

除语言测试外，窗口脚本在隔离 profile 写入 `preferences.json` 固定中文，断言不随本机系统语言变化。`composer.mjs` 把 Tab 步数写入 `output/tests/composer.json`。窗口脚本接受可执行文件路径，例如 `pnpm test:ui release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`。`dialogs.mjs` 需要人工操作，不纳入自动检查。

`fixtures/packaged-app.mjs` copies release apps outside the checkout to prevent dependency resolution from the source tree. Cleanup retries temporary Windows file locks for a bounded interval after the app closes; it never removes the source package or a user profile.

夹具各自构建到 `output/tests/build/{sqlite,history,periods,performance}/`，避免清空其他场景的文件；截图在 `output/tests/screenshots/`，性能记录在 `output/tests/performance/`。这些目录全部忽略，不进入正式包。

`pnpm build` followed by `pnpm test:periods [packaged-executable]` reproduces planning acceptance. The production Repository/SQLite fixture injects its own clock for calendar boundaries, expired commands, version/generation conflicts, receipts, undo holds and export/restore; the native window keeps the real clock and production bridge. It covers current/future keyboard and pointer drops, past/current/future draft round trips, menu focus in a virtual list, five-locale navigation geometry, restart and workspace replacement. Transfer IPC fixtures emit the main window's `focus` notification to invoke production reconciliation without changing native activation; this is fixture refresh, not native focus acceptance. The navigation fixture captures paused directional-motion frames, checks rapid reversal and reduced-motion cleanup, and verifies inline/date-only headings. Other screenshots use reduced motion. `--navigation` selects only the navigation fixture during development; completion runs the full script. Screenshots, `boundaries.json` and `report.json` are written to `output/tests/periods/`, including Electron/Node/SQLite and host OS/CPU. No production test clock or renderer API replacement is added. Source-Electron acceptance does not claim packaged, Windows or manual sleep/IME acceptance. Failure scenarios were recorded in [period planning](../../../docs/features/period-planning.md) before implementation.

`pnpm test:startup [packaged-executable]` separately measures three production launches each for configured empty and synthetic 100-item boards. `GOALLOOM_STARTUP_ENTRY` selects a frozen app entry; `GOALLOOM_STARTUP_LABEL` names the report; `GOALLOOM_STARTUP_SAMPLES` and `GOALLOOM_STARTUP_IDLE_MS` default to 3 and 2000. `GOALLOOM_STARTUP_PANELS=0` skips optional Settings/search/composer/detail checks. JSON and screenshots go to `output/tests/performance/startup/`. Each launch gets fresh app caches and a closed synthetic database, with daily backups enabled; OS caches are not flushed. Startup/idle memory uses natural GC; post-panel forced GC is reported separately. Summed process working sets can include shared pages, so they are not unique physical memory. No real workspace or credential is used; this optional benchmark is outside `verify`.

`pnpm test:performance [packaged-executable]` is a **release-only** benchmark measuring isolated production performance with 500 historical + 200 active tasks (realistic user scale). Run only before releases or when explicitly requested; not required for feature development, commits, or merges into `main`.

Performance fixture failure cases: current flow rules reject colorless links; duplicate parent IDs invalidate a seed; stale restore counts or out-of-range query-plan IDs fail after reducing the workload. Keep 500 historical and 200 active items, including a colored year root for the seeded DAG, two distinct parents per measured child, and valid IDs for query plans. All data still goes through production commands.

`pnpm test:scaling` is a **release-only** batch growth benchmark (200/400/800 items). Run only before releases or when explicitly requested.

`pnpm test:large-workspace` manually runs the 32,769/100,000-task storage check. It is excluded from `pnpm verify`, `pnpm test:review` and the review runner defaults, including during release verification. Evidence: `output/tests/review-followup/large-workspace.json`.

Panel latency records the browser input event through the dialog's open mutation and two animation frames, separately from Playwright's polling-dependent automation time. `GOALLOOM_STARTUP_ITEMS=0` or `100` narrows a diagnostic run; `GOALLOOM_STARTUP_SCRIPTS=0` disables debugger-based script inspection when isolating measurement overhead.

Playwright 控制真实窗口，并关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。退出草稿的消息框回答桩只验证逻辑；原生对话框、IME、安装/升级与睡眠仍由负责人验收。

`celebration.mjs` observes the real canvas translate calls without replacing drawing, random values or clocks. It verifies exact viewport-corner origins and measures pixel bounds and all four horizontal quarters around 850 ms at 1880 × 1000 and 1280 × 760. Origin, spread and native-detail screenshots accompany the measured geometry in `celebration.json`.

`feedback.mjs` uses actual UI actions and authoritative IPC fixtures. Its multi-item plan case calls the mounted Composer submit callback, preserving the real write and receipt path without a cloud provider; it does not claim Jev analysis acceptance.

`pnpm test:links [packaged-executable]` runs focused link-preview acceptance in an isolated real Electron profile. It seeds the production preview cache with synthetic public-URL metadata and a tiny local PNG, then exercises the production preload/main/renderer path. Node DNS/HTTP(S) and the isolated provider session's fetch are denied for offline checks; the final favicon group substitutes deterministic DNS/HTTP responses at the transport boundary without live network access. The external browser boundary records Electron's `shell.openExternal`; no browser is launched. JSON and screenshots are written to `output/tests/link-previews/`; failures also record app-local native focus/visibility, the active element, hovered elements and breakpoint visibility. This verifies deterministic offline behavior, not live-provider availability.

`fixtures/inline-link-regressions.mjs` adds legacy/null-icon cache enrichment, exact official provider PNG/ICO responses, failed/SVG/oversized icon fallback, request deduplication, unchanged metadata timestamps, natural Chinese-title/named-link wrapping and offline restart. `pnpm --filter @goalloom/desktop exec -- node tests/link-previews.mjs --inline` selects this regression during development, with evidence in `output/tests/link-previews/inline/`; the full links command includes it at completion. Provider responses are controlled at Electron's isolated session boundary; the production parser, byte validation, IPC, cache and renderer remain active.

`fixtures/detail-titles.mjs` covers complete rich detail headings, first-line control alignment, title/link action separation, growing raw editing, composition/Escape/Enter, autosave, native undo/redo across rich/raw handoffs and invalid-title close rejection, saved-only metadata, authored labels, URL-only titles and deleted-item reading. `pnpm --filter @goalloom/desktop exec -- node tests/link-previews.mjs --titles` selects it with reports/screenshots in `output/tests/link-previews/titles/`; `pnpm test:links` includes it. Description, renderer-race, past/future-editing and feedback fixtures enter through the visible edit action or wait for the rendered title.

`pnpm test:ui` includes `fixtures/detail-rail.mjs`: a permanent activity calendar, cancel/archive/delete actions, live shrinking from 1280px to 720px, native hit testing and unchanged item data across four themes. Reports and screenshots go to `output/tests/detail-rail/`. `pnpm test:language` captures the visible rail actions and flow-choice labels/hint geometry in all five locales. Lifecycle, search/detail-close and read-only deleted-item checks stay in their owning scenarios.

`pnpm test:ui` captures the untouched initial empty board and actual glyph-line grouping under `output/tests/empty-column/`, providing repeatable visual evidence for shared empty-state typography.

`fixtures/description-checklists.mjs` covers checked/unchecked/uppercase/nested Markdown tasks, literal code, pointer/keyboard toggles, local undo/redo, immediate autosave, raw clipboard and persistence, list input/continuation/exit, themes and deleted-item reading. `pnpm --filter @goalloom/desktop exec -- node tests/descriptions.mjs --checklists` selects it under `output/tests/descriptions/checklists/`; the full `pnpm test:descriptions` includes it.

`fixtures/description-selection.mjs` measures actual selected text and floating tools for first-line selection, scroll boundaries, off-screen anchors, window resizing and expanded link editing. It also checks Bold/undo, Escape and unchanged source. `pnpm --filter @goalloom/desktop exec -- node tests/descriptions.mjs --selection-tools` selects it under `output/tests/descriptions/selection-tools/`; the full description suite includes it. Geometry is measured in the production renderer inside native Electron, with no positioning mock.

`pnpm test:descriptions` uses a fresh English-language native Electron profile with the production preload, main and SQLite. It covers Markdown shortcuts/nesting/exit, safe whole-document paste, preserved source, metadata without writes, formatting/link editing, clipboard source semantics, local undo, autosave, composition-Enter protection, an authoritative save-receipt gate and the 100,000-character limit. `--editing` selects the base editing journey; reports/screenshots live in `output/tests/descriptions/` (or its `editing/` subdirectory). Composition events are synthesized; a physical OS input-method session and Windows/package acceptance are not claimed. Homepage browser prototypes have separate evidence in `output/tests/description-prototypes/`.

`fixtures/description-alignment.mjs` compares the placeholder's first glyph with typed, saved and reopened text in native Electron across five locales, four themes and normal/150% zoom at large/compact sizes. It checks bounded fill edges, editing-only insets, flush reading text, long-text wrapping, unchanged Markdown, full editor height and that focusing an empty note never writes. `pnpm --filter @goalloom/desktop exec -- node tests/descriptions.mjs --alignment` selects it under `output/tests/descriptions/alignment/`; the full description suite includes it. `alignment-geometry.json` records measured drift alongside the screenshots.

`autosave.mjs`: Real Electron/SQLite autosave, empty-title detail dismissal outside trash, one-step saved-title/placement undo, content/lifecycle guards, delayed and unknown receipts, property actions and native close/quit/restart. `--discard` selects `fixtures/detail-discard.mjs` and `fixtures/discard-data.ts`: native interactions plus production transaction/past-period/JSON/SQLite recovery boundaries. Synthetic evidence lives in `output/tests/autosave/` (selector: `discard/`). `fixtures/detail-save.mjs` waits for committed detail state and blurs the editor.

`recovery.mjs`: Protective reset, maintenance, generation guards, SQLite restore, restart and rollover pause. After reset it completes the empty-workspace setup before opening Settings to restore, matching the onboarding and upgrade contract. Reports and screenshots are written to `output/tests/recovery/`; an optional executable argument verifies the packaged app.

`periods.mjs` records the last pointer position, viewport, hover media and each column's hover/chevron state on failure, alongside native focus and renderer input evidence. Use `--navigation` for isolated period-navigation diagnosis; it preserves the same assertions as full period acceptance.

`weekly-review.mjs` records hover matching, disabled state, hit testing and active CSS transitions before asserting the footer surface. `--week-first` and `--week-last` select one isolated calendar scenario without changing its assertions.

`relation-drag.mjs` uses `fixtures/relation-visibility.mjs` for its explicit native hide/show contract: raw Electron and CDP `noDefaults` preserve actual `document.visibilityState`. Relation fault injection wraps main IPC while retaining production transactions and receipts; it never replaces the renderer bridge.

The link probe sizes the native Electron window before wheel input without forcing activation. CDP viewport emulation alone can put a visible screenshot target outside the native compositor's bounds; the report records both geometries, focus, wheel delivery and the resulting scroll offset.

Failure scenarios specified before writing the probe:

- Mixed Chinese prose, bare URLs and named Markdown links must preserve their order, custom labels and exact saved source; repeated references must produce one preview per unique URL.
- Multi-link cards must show a stable-height horizontal strip with a next-card hint, accurate count, bounded previous/next buttons and keyboard/wheel navigation; gestures must not move a task or open a link.
- Clicking an inline link or preview must cross the real external-opening IPC with the exact HTTP(S) URL; unsupported schemes and private-network preview requests must be rejected.
- A missing image or unavailable preview must leave a usable link. Cached images must render offline, survive a restart and avoid mutating the task title, version or timestamps.
- Remounting a successfully cached URL in saved task details must show its metadata in the first DOM insertion, with no transient pending state or repeated network work. Expired successful renderer metadata must remain visible while it is revalidated.
- Opening old, completed or archived tasks must render their links without a migration or write. Editing must expose the raw URL/Markdown and save the user's text unchanged.
- The five supported locales must translate preview controls, retain the same URLs and show no renderer exceptions. The report must distinguish source-Electron coverage from packaged-desktop acceptance.

`sync-join/`, `sync-join.mjs` and `sync-join-native.mjs` exercise first connection, stable IDs/calendar/policies and offline rollover, logout/login, deleted-task protection, rollback and concurrent joining through the real service/SDK/storage and native renderer. Reports and screenshots: `output/tests/sync-join/`.

`pnpm test:subtasks` also covers dragging or selecting a root with children to flatten the group into another root, sibling order, selected child-slot insertion and one-step outline undo. Its `--data` fixture checks mixed lifecycle states, Later/period placement, inherited flows, late-write rollback, retry identity, child-move undo conflicts, forged group receipts and JSON/SQLite restart recovery. `pnpm test:sync-replay` verifies ordered flattening and undo on two encrypted peers. Evidence stays under `output/tests/subtasks/` and `output/tests/sync-replay/`.

[PROTOCOL]: Update this header when making changes, then check README.md.

`subtasks.mjs` checks that details omit the owning-task name and ownership/detach controls in all five languages, while the board context menu still makes a task independent and stored ownership/inherited goals stay intact. Reports and screenshots: `output/tests/subtasks/report.json` and `detail-properties-*.png`.

`pnpm build` followed by `pnpm test:ordering [packaged-executable]` runs the production Repository/SQLite boundary fixture and real Electron ordering journey, including relation-picker ordering, rejected saves, lost receipts, protected replacement with a delayed future response and a 129-row focus/draft/scroll check. After reset, the scenario completes empty-workspace setup before checking the retained device preference in Settings. It records transaction checks, observed WAAPI frames, relation endpoint error and both-axis breakpoint alignment, screenshots, video and Electron/Node/SQLite/OS/CPU in `output/tests/ordering/`. Only isolated synthetic data is used.

The full source `test:ordering` run also closes its first app and runs `parent-placement.mjs` and `parent-preferences.mjs`. The native script checks legacy preference migration (on/off), saved-value precedence, first-startup automatic rollover, immediate setting writes with debounced cloud reporting disabled, next-period/backlog group movement and restart. The headless script checks delayed remote projection versus local toggles, renderer acknowledgement ordering, and pulled preferences before reconciliation while the later upload is stalled, through production sources and a synthetic encrypted cloud. Their reports/screenshots stay in `output/tests/parent-placement/`, linked from `output/tests/ordering/report.json`. Development entries: `pnpm --filter @goalloom/desktop exec -- node tests/parent-placement.mjs` and `pnpm --filter @goalloom/desktop exec -- node tests/parent-preferences.mjs`. Ordering selectors and packaged-executable runs do not invoke these source-only scenarios.

`ordering-seed.ts` includes `ordering-hidden-groups.ts` and `rollover-placement.ts`: production transactions verify visible local-group anchors, source-local arrivals, unchanged older placements, explicit slots, stale-batch rejection, rollback, final sync anchors, receipt replay and expired-period undo holds. These transaction reports do not replace native acceptance.

Note-rewrite acceptance: `pnpm test:assistance` covers the choice-first single-pane UI, settings authorization, automatic persistence, cancellation/stale edits, malformed/completion-loss output, source budgets, receipt retries, undo and five languages using a synthetic transport. `assistance/data.ts` also covers description-effect JSON/SQLite recovery and owned-field conflicts. Native screenshot/report artifacts are under `output/tests/assistance/`; `fixtures/detail-rail.mjs` now checks header actions and the absence of the retired rail.

`pnpm test:composer` includes `auto-link-storage.mjs` and `auto-link.mjs` after the existing Composer and column-entry scenarios. The storage fixture runs real Repository/SQLite writes, immutable creation/completion receipts, manual edit-back cancellation, non-top undo/scoped restore, future periods/insertion, stale optional versus explicit parents, duplicate replies, JSON/SQLite recovery and protected v10-to-current upgrade. The native scenario holds a synthetic Jev 1.14 transport while Enter commits, records Enter-to-receipt and observed-card latency, and covers closed dialogs, continuous input/focus, ready results, explicit no-flow/new-flow choices, unknown write replies, more than 64 candidates, multi-parent pruning, URL-only input and batch failure. No real user profile or key is used. Evidence and screenshots: `output/tests/auto-link/`. Development selectors are `pnpm test:auto-link`, `node tests/auto-link.mjs --inline-feedback` and `node tests/auto-link-storage.mjs`. The `fixtures/inline-capture.mjs` scenarios cover visible pending/ready/no-match/failure states, five-locale feedback geometry, retry/focus, stale draft replies, local Enter after failure and explicit resend when AI status arrives after typing.

`pnpm test:sync-replay` also verifies causal automatic completion and `item.undoCreate` across two encrypted peers. Remote edits and edit-back reject stale completion atomically; unrelated later text is preserved by creation undo and scoped restore. Evidence: `output/tests/sync-replay/report.json`.

`fixtures/sync-creation-placement.ts` extends that encrypted journey with ready/late goal placement, disabled placement, explicit head/middle/tail insertion, future periods, deleted/nested anchor exclusion and B/A/C plan creation preserving A/B/C order. Reports include the local, pending-rebuild, canonical writer/peer and repeated-exchange positions. Creation undo/restore retains final positions on both peers.

`fixtures/sync-rollover-placement.ts` and `fixtures/sync-sort-gaps.ts` extend the same journey with committed rollover/backlog/group positions and gap-safe ordering. The report's `rolloverPlacement` and `sortGaps` observations compare local, pending and canonical positions, repeated exchange and undo. Coverage includes hidden group roots, carried-child source ownership, root-first group undo, sibling-only normalization and earlier semantic undo without rewriting original receipts. The synthetic remote does not establish live-service or packaged acceptance.

`pnpm eval:capture` runs only Jev 1.14 against frozen synthetic development/holdout bilingual cases plus 18 fictional development-scope regressions, with URLs treated as unknown text sources. It reports complete parent-set accuracy, false/missed edges, errors, request counts and complete-case P50/P95. Details and the zero-network `--prepare` option are in [the evaluation README](../scripts/eval/capture/README.md). Live quality and transport timing are separate from synthetic desktop acceptance.

`node tests/auto-link.mjs --placement` selects `fixtures/capture-placement.mjs` with evidence in `output/tests/auto-link/placement/`; the full Composer run includes it. It covers bottom entry with ready/late suggestions, submission-time on/off preference across later toggles, unchanged older placements, continued input/focus and one-step undo/restore. `test:ordering` also checks the same bottom entry with a manually selected goal. Actual explicit insertion remains covered at the Repository boundary.

`pnpm test:sync-scheduling` runs the frozen pre-change baseline, production SyncService/SDK/storage fault scenarios, burst/bulk batches, quota recovery and a real native window with five-language waiting feedback. The cloud, OS cipher and monotonic clock are controlled boundaries. Reports, source hashes, request/body-byte totals and screenshots are under `output/tests/sync-cost/`. The runner needs baseline Git object `7b2f91148673637fa32b1dd68faf25f6a80a6084`. It does not deploy SQL, query billing, test real sleep, or replace hosted quota/Cron acceptance.

`pnpm test:sync-security` runs `sync-security/cases.ts`, `password-cases.ts` and `resume-cases.ts` against production service/SDK/Electron-SQLite, then `native-entry.ts` for renderer/preload/IPC controls and five-language screenshots. Coverage includes account isolation, keep/clear, pending writes, protected file handoff, unreadable vault recovery, automatic-session promotion, Case 1, restart/upgrade migration, logout/password gating, retained task/device IDs and tombstones, late-save/logout races, independent denied AI storage, old cloud preservation, pinned restarts, idempotent creation, backup/install failure, OS transitions and cleanup. Select the recovery/resume group with `node tests/sync-security.mjs password` or `resume`. No real user profiles or credentials are accessed. Evidence: `output/tests/sync-security/`.

`pnpm test:sync-security:packaged` runs the same native journeys in an isolated ad-hoc macOS ASAR app with test-only cipher/OAuth/HTTP/connectivity boundaries. It disables updater/protocol registration and uses a dedicated fixture bundle ID. Fixture overrides stay separate from production's required session profile/entitlements. Reports, runtime/platform scope, screenshots and `instrumented-app.asar` are in `output/tests/sync-security/packaged/`. Live hosted HTTP/OAuth, signed release upgrades and Windows remain separate.

`pnpm test:sync-security:live` runs `sync-security/live.ts` against the configured development Supabase project with explicitly authorized memory-only API keys. Two disposable Auth accounts and separate SQLite profiles exercise real encrypted uploads/downloads, private Realtime, kept-account isolation, non-destructive recovery, pinned restarts, a committed/lost response, scoped deletion, automatic online recovery and clear-account handoff. The runner verifies removal of only its own users/workspaces/devices. Report and redacted log: `output/tests/sync-security/live/`. It uses password-auth test sessions and an ephemeral local AES cipher; Google provider UI, OS Wi-Fi, keychain and signed installers remain separate scopes.

`subtasks.mjs --ownership` selects native rounded parent-child line geometry/dot endpoints in four appearances, cross-column drag, unindented owner navigation and screenshots. `--title-editing` selects `fixtures/title-nesting.mjs`: existing-title Tab/Shift+Tab in seven columns, native navigation/IME, draft/caret/focus retention, completed-section migration, remote-child detachment, independent undo and failed/delayed/lost replies. Both fixtures run in the full subtask journey. Its full transaction fixture includes `fixtures/subtask-ownership.ts` (Later, undo, rollover, backlog, lifecycle and JSON/SQLite recovery). `fixtures/sync-subtask-ownership.ts` extends the full encrypted two-peer replay, including explicit head/middle/tail detachment and one-step undo. Evidence: `output/tests/subtasks/`, `output/tests/sync-replay/`, and the feature-run manifest in `output/tests/ownership/`.

`pnpm test:apple-login` verifies native first-run/settings Apple and Google routing, PKCE, cancellation, shared authorization locking, visible failure/retry, invalid-provider rejection and password setup through the production loopback callback. Reports/screenshots: `output/tests/apple-login/`. Provider responses and cipher are synthetic.

`fixtures/due-badges.mjs` verifies six board deadline states, all five locales, paper/minimal light/dark themes, 720/1280 windows, first-line geometry and unchanged task data. Evidence: `output/tests/due-calendar/badges-*.png` and `calendar-report.json`.

`fixtures/capture-nesting.mjs` extends native `auto-link.mjs` with unique/ambiguous Cmd+N ownership, ready/held replies and explicit independent-task choices (`--nesting` selects this group). `fixtures/capture-nesting-storage.ts` extends `auto-link-storage.mjs` with transactional owner guards, immutable grouped undo/restore and JSON/SQLite history validation. `fixtures/sync-replay.ts` covers encrypted ownership completion and peer-text-preserving undo/restore. Evidence stays under `output/tests/auto-link/` and `output/tests/sync-replay/`.
