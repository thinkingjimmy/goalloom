# desktop/

> 父级：[tests](../README.md)。真实 Electron 运行测试；可复用源码入口与已打包程序。

```text
desktop/
├── later-sidebar.mjs    # Fixed planning columns, legacy preference handling, Later count, independent scrolling, drag/undo, preserved drafts, motion, themes/locales and restart; output/tests/later-sidebar
├── sqlite.mjs           # 单独构建/启动真实 main 的内置 SQLite 探针
├── workspace.mjs        # 看板业务、流程筛选快捷键与快捷键设置（截图 settings-shortcuts.png）、协议/CSP/IPC、主题与窄窗口
├── history.mjs          # Live past-task editing/groups, filter return to current, paging recovery, focus/feedback, immutable history, backlog/hold and replacement isolation; history.json and history/past-task screenshots
├── periods.mjs          # Compact TODO menus with source-row activation/cursors, unified period navigation, editable future periods, cross-period drafts, sorting, undo, locating, five-language header geometry and restart; app-local input/focus failure diagnostics in output/tests/periods
├── month-review.mjs    # Period-end records, live closing, unified guide, resume and exact planning destinations, partial failures and receipt recovery; --combined adds fresh month → week planning; output/tests/insight/{month-review,combined-review}/
├── insight.mjs          # 流程洞察（无模型路径）：空列卡批量/自己写、筛选／悬停预览断点 ＋ 的可达性、创建与撤销、尾部接点对齐及一次性引导、预填新建、跳级 insertBetween 与一次撤销、标明周期的复盘入口／标题与四步（复盘日才跑）、设置 › 洞察；output/tests/insight
├── insight-generation.mjs # Development/production Electron: review header, drafting, Settings with complete trial-action captures, summary persistence/restart/refresh/invalidation/failures/reset; real bridge/storage and synthetic HTTP; output/tests/insight/generation/
├── insight-live.mjs     # Optional real OpenRouter: Settings trial/no writes, seven drafts, direct creation and review summary; titles, latency and runtime evidence; outside verify
├── recovery.mjs         # 保护备份/维护/重置/SQLite 恢复与重启暂停
├── composer-live.mjs    # 可选：真实 OpenRouter Jev（需 .env.local Key）连接、默认采用 Jev 的上级推荐、↵ 创建并核对看板/关联/说明，截图作证据；不进 verify
├── composer.mjs         # 首次流程、全局 composer 普通 Later/会话草稿与关闭后的真实保存回执、列头＋Enter/Space 与 Tab 步数、拆解
├── due-dates.mjs        # Deadline calendar: real Electron draft/save boundaries, leap/month/week keyboard navigation, focus/info layers, five locales and four themes; output/tests/due-calendar/
├── performance.mjs      # 大数据夹具、存储延迟与窗口启动/内存
├── startup.mjs          # 隔离空看板/100 条目的三次启动与自然空闲内存、按需弹窗和会话草稿证据
├── relations.mjs        # Relation lines/dots with full task titles, matching endpoint sizes, dynamic popover positioning and board-ordered flow filters; row/column moves, undo, shortcuts and reload; relation-endpoints.json, flow-dot-position.json/screenshots and app-local failure diagnostics
├── relation-drag.mjs    # Native relation dragging, atomic adoption/undo, receipt recovery, automatic order, cancellation, clipped autoscroll, future/done targets and five locales; output/tests/relation-drag
├── language.mjs         # System language, setup/settings switching, main/worker copy, persistence, period-named review entries/drawers and translation checks; five-locale screenshots, language-*.png and output/tests/language.json
├── feedback.mjs         # Contextual success Toasts, keyboard undo, duration/hover/focus, original restore destination and persistent partial-restore warnings; feedback.json and feedback-*.png
├── link-previews.mjs    # Link text, cached previews, carousel gestures, external opening, unchanged legacy records and five locales; output/tests/link-previews/
├── descriptions.mjs     # Native Lexical Markdown/task lists, source preservation, clipboard, formatting, save receipts and length guards; output/tests/descriptions/
├── ordering.mjs         # Parent ordering, group-aware drag, future materialization/undo, receipt-first recovery, local preference restart and measured motion (output/tests/ordering)
├── celebration.mjs      # 完成撒花逐列按钮偏好/重启、设置页预览、真实双角起点与大小窗口四分区覆盖、详情动效、静默完成/撤销及清理（celebration.json 与截图）
├── updates.mjs        # Settings › About: menu routing/re-targeting, real version and icon, update phases via the production event, top-bar/nav dots, menu relabelling; output/tests/updates/
├── update-install.mjs # Optional macOS: signed 90.0.0 app + 90.0.1 zip/latest-mac.yml on a 127.0.0.1 feed; UI check → download → install on quit; outside verify
├── dialogs.mjs          # 操控真实原生保存/打开对话框的验收入口，保存 JSON 证据和恢复后截图
├── review/              # 已确认缺陷、输入/维护竞态、长列、wire、增长曲线和大备份回归
└── fixtures/
    ├── celebration-visibility.mjs # 原生窗口隐藏验证：独立 Electron + 无前台模拟的 CDP，确认真实 visibility 与动效释放
    ├── sqlite-probe.ts  # Electron main 的驱动/事务/恢复探针
    ├── review-seed.ts   # Injected-clock previous-month/week fixtures for review and provider-cache acceptance
    ├── history-seed.ts  # 正式事务生成历史样本，无生产测试时钟
    ├── past-period-editing.mjs # Native past-task editing, completion/reopening, restore, move/undo, focus, query guards and last-page recovery
    ├── filter-navigation.mjs # Top-bar/shortcut return from history, flow identity, input guards, scroll reset and future-draft retention
    ├── periods-seed.ts  # Production Repository/SQLite clock-boundary, atomicity and recovery assertions plus the planning UI fixture
    ├── period-navigation.mjs # Title/checkbox and arrow/flow-dot alignment across idle/hover/focus, inline/date-only dates, contextual return labels, paused motion frames and reduced-motion acceptance
    ├── link-preview-cache.mjs # Fresh production preview-cache records and locally generated PNG; no renderer API replacement
    ├── favicon-transport.mjs # Real preview IPC with deterministic HTTP/DNS fixtures: declared/fallback raster/ICO icons and unsafe/oversized/malformed responses
    ├── poll.mjs         # pollPage：轮询 renderer 里的异步桥接读取（page.waitForFunction 会把 async 谓词的 Promise 当作真值立即返回）
    ├── preview-breakpoints.mjs # Highlighted-chain actions, ancestor/sibling switching, multiple and mixed-horizon leaves, hover/focus retention, empty targets, multi-flow deduplication, descendant-linked creation and undo; called by insight.mjs
    ├── flow-dot-position.mjs # Bottom-edge menus, mode/search size changes, direct parent opening and scroll/resize geometry; real Electron/IPC and flow-dot-position-*.png
    ├── relation-drag-data.ts # Production Repository/SQLite adoption rollback, receipts, conflict-safe undo and JSON/SQLite transfer validation under Electron
    ├── relation-visibility.mjs # Raw Electron/CDP native hide/show cancellation without foreground emulation; called by relation-drag.mjs
    └── performance.ts   # 10,000 条目/1,000 活跃及真实历史，测恢复与延迟
```

按[功能测试映射](../../docs/development.md#测试范围)从仓库根选择脚本：完成一次改动只需本次场景与所属功能的全部 E2E，命令去重；这里的成员清单不是每次必须全部执行的清单。Onboarding 的专门覆盖目前位于 `workspace.mjs`、`composer.mjs`、`language.mjs`；其他脚本仅经过向导初始化不算相关覆盖。Review 回归按所需分组调用 `node tests/desktop/review/run.mjs <group>`，不默认运行所有分组。全量 `pnpm verify` 只在发布前或明确要求时运行。

同机操作引起的失焦／遮挡按[桌面测试干扰](../../docs/development.md#桌面测试干扰)处理：先确认原因，不自动增加失焦用例或等待／重试；消除已确认的环境干扰后只补跑最小范围一次。新增回归必须有产品契约或受控复现依据，现有真实焦点与可见性需求继续保留。

History, periods, ordering, relations and link-preview setup only sizes the native window; it does not add `show()`, `focus()`, `app.focus()` or `bringToFront()` calls. Relations uses the actual native viewport and a non-draggable top-bar button when moving the pointer away from the board. Keep the existing input, wheel, drag, screenshot and restart assertions. In-app element focus remains part of keyboard coverage. Native refocus in the Review reconciliation check and hide/show in the celebration visibility fixture exercise explicit behavior. The production app still shows its window on startup, so this is reduced activation, not headless acceptance.

除语言测试外，窗口脚本在隔离 profile 写入 `preferences.json` 固定中文，断言不随本机系统语言变化。`composer.mjs` 把 Tab 步数写入 `output/tests/composer.json`。窗口脚本接受可执行文件路径，例如 `pnpm test:ui release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`。`dialogs.mjs` 需要人工操作，不纳入自动检查。

夹具各自构建到 `output/tests/build/{sqlite,history,periods,performance}/`，避免清空其他场景的文件；截图在 `output/tests/screenshots/`，性能记录在 `output/tests/performance/`。这些目录全部忽略，不进入正式包。

`pnpm build` followed by `pnpm test:periods [packaged-executable]` reproduces planning acceptance. The production Repository/SQLite fixture injects its own clock for calendar boundaries, expired commands, version/generation conflicts, receipts, undo holds and export/restore; the native window keeps the real clock and production bridge. It covers current/future keyboard and pointer drops, past/current/future draft round trips, menu focus in a virtual list, five-locale navigation geometry, restart and workspace replacement. Transfer IPC fixtures emit the main window's `focus` notification to invoke production reconciliation without changing native activation; this is fixture refresh, not native focus acceptance. The navigation fixture captures paused directional-motion frames, checks rapid reversal and reduced-motion cleanup, and verifies inline/date-only headings. Other screenshots use reduced motion. `--navigation` selects only the navigation fixture during development; completion runs the full script. Screenshots, `boundaries.json` and `report.json` are written to `output/tests/periods/`, including Electron/Node/SQLite and host OS/CPU. No production test clock or renderer API replacement is added. Source-Electron acceptance does not claim packaged, Windows or manual sleep/IME acceptance. Failure scenarios were recorded in [period planning](../../docs/features/period-planning.md) before implementation.

`pnpm test:startup [packaged-executable]` separately measures three production launches each for configured empty and synthetic 100-item boards. `GOALLOOM_STARTUP_ENTRY` selects a frozen app entry; `GOALLOOM_STARTUP_LABEL` names the report; `GOALLOOM_STARTUP_SAMPLES` and `GOALLOOM_STARTUP_IDLE_MS` default to 3 and 2000. `GOALLOOM_STARTUP_PANELS=0` skips optional Settings/search/composer/detail checks. JSON and screenshots go to `output/tests/performance/startup/`. Each launch gets fresh app caches and a closed synthetic database, with daily backups enabled; OS caches are not flushed. Startup/idle memory uses natural GC; post-panel forced GC is reported separately. Summed process working sets can include shared pages, so they are not unique physical memory. No real workspace or credential is used; this optional benchmark is outside `verify`.

Panel latency records the browser input event through the dialog's open mutation and two animation frames, separately from Playwright's polling-dependent automation time. `GOALLOOM_STARTUP_ITEMS=0` or `100` narrows a diagnostic run; `GOALLOOM_STARTUP_SCRIPTS=0` disables debugger-based script inspection when isolating measurement overhead.

Playwright 控制真实窗口，并关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。退出草稿的消息框回答桩只验证逻辑；原生对话框、IME、安装/升级与睡眠仍由负责人验收。

`celebration.mjs` observes the real canvas translate calls without replacing drawing, random values or clocks. It verifies exact viewport-corner origins and measures pixel bounds and all four horizontal quarters around 850 ms at 1880 × 1000 and 1280 × 760. Origin, spread and native-detail screenshots accompany the measured geometry in `celebration.json`.

`feedback.mjs` uses actual UI actions and authoritative IPC fixtures. Its multi-item plan case calls the mounted Composer submit callback, preserving the real write and receipt path without a cloud provider; it does not claim Jev analysis acceptance.

`pnpm test:links [packaged-executable]` runs focused link-preview acceptance in an isolated real Electron profile. It seeds the production preview cache with synthetic public-URL metadata and a tiny local PNG, then exercises the production preload/main/renderer path. Node DNS/HTTP(S) and the isolated provider session's fetch are denied for offline checks; the final favicon group substitutes deterministic DNS/HTTP responses at the transport boundary without live network access. The external browser boundary records Electron's `shell.openExternal`; no browser is launched. JSON and screenshots are written to `output/tests/link-previews/`. This verifies deterministic offline behavior, not live-provider availability.

`fixtures/inline-link-regressions.mjs` adds legacy/null-icon cache enrichment, exact official provider PNG/ICO responses, failed/SVG/oversized icon fallback, request deduplication, unchanged metadata timestamps, natural Chinese-title/named-link wrapping and offline restart. `node tests/desktop/link-previews.mjs --inline` selects this regression during development, with evidence in `output/tests/link-previews/inline/`; the full links command includes it at completion. Provider responses are controlled at Electron's isolated session boundary; the production parser, byte validation, IPC, cache and renderer remain active.

`fixtures/detail-titles.mjs` covers complete rich detail headings, first-line control alignment, title/link action separation, growing raw editing, composition/Escape/Enter, autosave, saved-only metadata, authored labels, URL-only titles and deleted-item reading. `node tests/desktop/link-previews.mjs --titles` selects it with reports/screenshots in `output/tests/link-previews/titles/`; `pnpm test:links` includes it. Description, renderer-race, past/future-editing and feedback fixtures enter through the visible edit action or wait for the rendered title.

`fixtures/description-checklists.mjs` covers checked/unchecked/uppercase/nested Markdown tasks, literal code, pointer/keyboard toggles, local undo/redo, immediate autosave, raw clipboard and persistence, list input/continuation/exit, themes and deleted-item reading. `node tests/desktop/descriptions.mjs --checklists` selects it under `output/tests/descriptions/checklists/`; the full `pnpm test:descriptions` includes it.

`fixtures/description-selection.mjs` measures actual selected text and floating tools for first-line selection, scroll boundaries, off-screen anchors, window resizing and expanded link editing. It also checks Bold/undo, Escape and unchanged source. `node tests/desktop/descriptions.mjs --selection-tools` selects it under `output/tests/descriptions/selection-tools/`; the full description suite includes it. Geometry is measured in the production renderer inside native Electron, with no positioning mock.

`pnpm test:descriptions` uses a fresh English-language native Electron profile with the production preload, main and SQLite. It covers Markdown shortcuts/nesting/exit, safe whole-document paste, preserved source, metadata without writes, formatting/link editing, clipboard source semantics, local undo, autosave, composition-Enter protection, an authoritative save-receipt gate and the 100,000-character limit. `--editing` selects the base editing journey; reports/screenshots live in `output/tests/descriptions/` (or its `editing/` subdirectory). Composition events are synthesized; a physical OS input-method session and Windows/package acceptance are not claimed. Homepage browser prototypes have separate evidence in `output/tests/description-prototypes/`.

`autosave.mjs`: Real Electron/SQLite autosave, delayed and unknown receipts, invalid input, property actions, native close/reopen, composer quit cancellation and application restart. Synthetic data only; repeatable evidence in `output/tests/autosave/`. `fixtures/detail-save.mjs` waits for committed detail state without an obsolete Save button; its finish helper also blurs the editor.

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

[PROTOCOL]: Update this header when making changes, then check README.md.

`pnpm build` followed by `pnpm test:ordering [packaged-executable]` runs the production Repository/SQLite boundary fixture and real Electron ordering journey, including relation-picker ordering, rejected saves, lost receipts, protected replacement with a delayed future response and a 129-row focus/draft/scroll check. It records transaction checks, observed WAAPI frames, relation endpoint error and both-axis breakpoint alignment, screenshots, video and Electron/Node/SQLite/OS/CPU in `output/tests/ordering/`. Only isolated synthetic data is used.
