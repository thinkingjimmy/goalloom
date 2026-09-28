# desktop/

> 父级：[tests](../README.md)。真实 Electron 运行测试；可复用源码入口与已打包程序。

```text
desktop/
├── sqlite.mjs           # 单独构建/启动真实 main 的内置 SQLite 探针
├── workspace.mjs        # 看板业务、流程筛选快捷键与快捷键设置（截图 settings-shortcuts.png）、协议/CSP/IPC、主题与窄窗口
├── history.mjs          # History column (outcome groups, summary, period picker, Esc return), backlog/hold, past-item restore destinations and replacement isolation; history.json, history-column.png and feedback-past-restore.png
├── periods.mjs          # Native TODO context menus, editable future periods, drafts, sorting, undo, locating, languages and restart; output/tests/periods
├── insight.mjs          # 流程洞察（无模型路径）：空列卡批量/自己写、单流程断点 ＋ 与一次性引导、预填新建、跳级 insertBetween 与一次撤销、复盘入口与四步（复盘日才跑）、设置 › 洞察；output/tests/insight
├── insight-generation.mjs # Development and production Electron: seven drafts, typed text, close/reopen, failure fallback, Settings retry/no writes and review lifecycle; synthetic HTTP, reports/screenshots in output/tests/insight/generation/
├── insight-live.mjs     # Optional real OpenRouter: Settings trial/no writes, seven drafts, direct creation and review summary; titles, latency and runtime evidence; outside verify
├── recovery.mjs         # 保护备份/维护/重置/SQLite 恢复与重启暂停
├── composer-live.mjs    # 可选：真实 OpenRouter Jev（需 .env.local Key）连接、默认采用 Jev 的上级推荐、↵ 创建并核对看板/关联/说明，截图作证据；不进 verify
├── composer.mjs         # 首次流程、全局 composer 普通 Later/会话草稿与关闭后的真实保存回执、列头＋Enter/Space 与 Tab 步数、拆解
├── performance.mjs      # 大数据夹具、存储延迟与窗口启动/内存
├── startup.mjs          # 隔离空看板/100 条目的三次启动与自然空闲内存、按需弹窗和会话草稿证据
├── relations.mjs        # Relation lines, hover/focus chains, scroll markers, preference persistence and filtered cycle TODO dots with hover/focus/menu access (relation-lines*.png, flow-dot-*.png)
├── language.mjs         # 系统语言侦测、配置页/设置即时切换、main/worker 文案、重启保持与 en/es/fr 漏译检查（截图 language-*.png、output/tests/language.json）
├── feedback.mjs         # Contextual success Toasts, keyboard undo, duration/hover/focus, original restore destination and persistent partial-restore warnings; feedback.json and feedback-*.png
├── link-previews.mjs    # Link text, cached previews, carousel gestures, external opening, unchanged legacy records and five locales; output/tests/link-previews/
├── celebration.mjs      # 完成撒花逐列按钮偏好/重启、设置页预览、真实双角起点与大小窗口四分区覆盖、详情动效、静默完成/撤销及清理（celebration.json 与截图）
├── dialogs.mjs          # 操控真实原生保存/打开对话框的验收入口，保存 JSON 证据和恢复后截图
├── review/              # 已确认缺陷、输入/维护竞态、长列、wire、增长曲线和大备份回归
└── fixtures/
    ├── celebration-visibility.mjs # 原生窗口隐藏验证：独立 Electron + 无前台模拟的 CDP，确认真实 visibility 与动效释放
    ├── sqlite-probe.ts  # Electron main 的驱动/事务/恢复探针
    ├── history-seed.ts  # 正式事务生成历史样本，无生产测试时钟
    ├── periods-seed.ts  # Production Repository/SQLite clock-boundary, atomicity and recovery assertions plus the planning UI fixture
    ├── link-preview-cache.mjs # Fresh production preview-cache records and locally generated PNG; no renderer API replacement
    ├── poll.mjs         # pollPage：轮询 renderer 里的异步桥接读取（page.waitForFunction 会把 async 谓词的 Promise 当作真值立即返回）
    └── performance.ts   # 10,000 条目/1,000 活跃及真实历史，测恢复与延迟
```

从仓库根调用 `pnpm test:electron`、`test:ui`、`test:history`、`test:periods`、`test:recovery`、`test:composer`、`test:language`、`test:relations`、`test:feedback`、`test:performance`。其余窗口脚本在隔离 profile 写入 `preferences.json` 固定中文，断言不随本机系统语言变化。`composer.mjs` 把 Tab 步数写入 `output/tests/composer.json`。窗口脚本接受可执行文件路径，例如 `pnpm test:ui release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`。`dialogs.mjs` 需要人工操作，不纳入自动检查。

夹具各自构建到 `output/tests/build/{sqlite,history,periods,performance}/`，避免清空其他场景的文件；截图在 `output/tests/screenshots/`，性能记录在 `output/tests/performance/`。这些目录全部忽略，不进入正式包。

`pnpm build` followed by `pnpm test:periods [packaged-executable]` reproduces planning acceptance. The production Repository/SQLite fixture injects its own clock for calendar boundaries, expired commands, version/generation conflicts, receipts, undo holds and export/restore; the native window keeps the real clock and production bridge. It covers current/future keyboard and pointer drops, menu focus in a virtual list, five locales, restart and workspace replacement. Transfer IPC fixtures use native window refocus to trigger reconciliation; screenshots use reduced motion. Screenshots, `boundaries.json` and `report.json` are written to `output/tests/periods/`, including Electron/Node/SQLite and host OS/CPU. No production test clock or renderer API replacement is added. Source-Electron acceptance does not claim packaged, Windows or manual sleep/IME acceptance. Failure scenarios were recorded in [period planning](../../docs/features/period-planning.md) before implementation.

`pnpm test:startup [packaged-executable]` separately measures three production launches each for configured empty and synthetic 100-item boards. `GOALLOOM_STARTUP_ENTRY` selects a frozen app entry; `GOALLOOM_STARTUP_LABEL` names the report; `GOALLOOM_STARTUP_SAMPLES` and `GOALLOOM_STARTUP_IDLE_MS` default to 3 and 2000. `GOALLOOM_STARTUP_PANELS=0` skips optional Settings/search/composer/detail checks. JSON and screenshots go to `output/tests/performance/startup/`. Each launch gets fresh app caches and a closed synthetic database, with daily backups enabled; OS caches are not flushed. Startup/idle memory uses natural GC; post-panel forced GC is reported separately. Summed process working sets can include shared pages, so they are not unique physical memory. No real workspace or credential is used; this optional benchmark is outside `verify`.

Panel latency records the browser input event through the dialog's open mutation and two animation frames, separately from Playwright's polling-dependent automation time. `GOALLOOM_STARTUP_ITEMS=0` or `100` narrows a diagnostic run; `GOALLOOM_STARTUP_SCRIPTS=0` disables debugger-based script inspection when isolating measurement overhead.

Playwright 控制真实窗口，并关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。退出草稿的消息框回答桩只验证逻辑；原生对话框、IME、安装/升级与睡眠仍由负责人验收。

`celebration.mjs` observes the real canvas translate calls without replacing drawing, random values or clocks. It verifies exact viewport-corner origins and measures pixel bounds and all four horizontal quarters around 850 ms at 1880 × 1000 and 1280 × 760. Origin, spread and native-detail screenshots accompany the measured geometry in `celebration.json`.

`feedback.mjs` uses actual UI actions and authoritative IPC fixtures. Its multi-item plan case calls the mounted Composer submit callback, preserving the real write and receipt path without a cloud provider; it does not claim Jev analysis acceptance.

`pnpm test:links [packaged-executable]` runs focused link-preview acceptance in an isolated real Electron profile. It seeds the production preview cache with synthetic public-URL metadata and a tiny local PNG, then exercises the production preload/main/renderer path. Node DNS/HTTP(S) and the isolated provider session's fetch are denied in the test process. The external browser boundary is recorded by replacing Electron's `shell.openExternal`; no browser is launched. JSON and screenshots are written to `output/tests/link-previews/`. This verifies deterministic offline behavior, not live-provider availability.

The link probe sizes and focuses the native Electron window before wheel input. CDP viewport emulation alone can put a visible screenshot target outside the native compositor's bounds; the report records both geometries, focus, wheel delivery and the resulting scroll offset.

Failure scenarios specified before writing the probe:

- Mixed Chinese prose, bare URLs and named Markdown links must preserve their order, custom labels and exact saved source; repeated references must produce one preview per unique URL.
- Multi-link cards must show a stable-height horizontal strip with a next-card hint, accurate count, bounded previous/next buttons and keyboard/wheel navigation; gestures must not move a task or open a link.
- Clicking an inline link or preview must cross the real external-opening IPC with the exact HTTP(S) URL; unsupported schemes and private-network preview requests must be rejected.
- A missing image or unavailable preview must leave a usable link. Cached images must render offline, survive a restart and avoid mutating the task title, version or timestamps.
- Remounting a successfully cached URL in saved task details must show its metadata in the first DOM insertion, with no transient pending state or repeated network work. Expired successful renderer metadata must remain visible while it is revalidated.
- Opening old, completed or archived tasks must render their links without a migration or write. Editing must expose the raw URL/Markdown and save the user's text unchanged.
- The five supported locales must translate preview controls, retain the same URLs and show no renderer exceptions. The report must distinguish source-Electron coverage from packaged-desktop acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
