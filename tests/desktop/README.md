# desktop/

> 父级：[tests](../README.md)。真实 Electron 运行测试；可复用源码入口与已打包程序。

```text
desktop/
├── sqlite.mjs           # 单独构建/启动真实 main 的内置 SQLite 探针
├── workspace.mjs        # 看板业务、流程筛选快捷键与快捷键设置（截图 settings-shortcuts.png）、协议/CSP/IPC、主题与窄窗口
├── history.mjs          # History/backlog/hold, past-item restore destinations and replacement isolation; history.json and feedback-past-restore.png
├── recovery.mjs         # 保护备份/维护/重置/SQLite 恢复与重启暂停
├── composer-live.mjs    # 可选：真实 OpenRouter Jev（需 .env.local Key）连接、默认采用 Jev 的上级推荐、↵ 创建并核对看板/关联/说明，截图作证据；不进 verify
├── composer.mjs         # 首次流程、全局 composer 普通 Later/会话草稿与关闭后的真实保存回执、列头＋Enter/Space 与 Tab 步数、拆解
├── performance.mjs      # 大数据夹具、存储延迟与窗口启动/内存
├── startup.mjs          # 隔离空看板/100 条目的三次启动与自然空闲内存、按需弹窗和会话草稿证据
├── relations.mjs        # 关系线：单流程筛选画线/跨级虚线/其余置灰、悬停与聚焦链、滚出视野标记、设置开关持久化（截图 relation-lines*.png）
├── language.mjs         # 系统语言侦测、配置页/设置即时切换、main/worker 文案、重启保持与 en/es/fr 漏译检查（截图 language-*.png、output/tests/language.json）
├── feedback.mjs         # Contextual success Toasts, keyboard undo, duration/hover/focus, original restore destination and persistent partial-restore warnings; feedback.json and feedback-*.png
├── celebration.mjs      # 完成撒花逐列偏好/重启、双角与详情动效、静默移动/完成和撤销、减少动态效果及清理（celebration.json 与截图）
├── dialogs.mjs          # 操控真实原生保存/打开对话框的验收入口，保存 JSON 证据和恢复后截图
├── review/              # 已确认缺陷、输入/维护竞态、长列、wire、增长曲线和大备份回归
└── fixtures/
    ├── celebration-visibility.mjs # 原生窗口隐藏验证：独立 Electron + 无前台模拟的 CDP，确认真实 visibility 与动效释放
    ├── sqlite-probe.ts  # Electron main 的驱动/事务/恢复探针
    ├── history-seed.ts  # 正式事务生成历史样本，无生产测试时钟
    └── performance.ts   # 10,000 条目/1,000 活跃及真实历史，测恢复与延迟
```

从仓库根调用 `pnpm test:electron`、`test:ui`、`test:history`、`test:recovery`、`test:composer`、`test:language`、`test:relations`、`test:feedback`、`test:performance`。其余窗口脚本在隔离 profile 写入 `preferences.json` 固定中文，断言不随本机系统语言变化。`composer.mjs` 把 Tab 步数写入 `output/tests/composer.json`。窗口脚本接受可执行文件路径，例如 `pnpm test:ui release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`。`dialogs.mjs` 需要人工操作，不纳入自动检查。

夹具各自构建到 `output/tests/build/{sqlite,history,performance}/`，避免清空其他场景的文件；截图在 `output/tests/screenshots/`，性能记录在 `output/tests/performance/`。这些目录全部忽略，不进入正式包。

`pnpm test:startup [packaged-executable]` separately measures three production launches each for configured empty and synthetic 100-item boards. `GOALLOOM_STARTUP_ENTRY` selects a frozen app entry; `GOALLOOM_STARTUP_LABEL` names the report; `GOALLOOM_STARTUP_SAMPLES` and `GOALLOOM_STARTUP_IDLE_MS` default to 3 and 2000. `GOALLOOM_STARTUP_PANELS=0` skips optional Settings/search/composer/detail checks. JSON and screenshots go to `output/tests/performance/startup/`. Each launch gets fresh app caches and a closed synthetic database, with daily backups enabled; OS caches are not flushed. Startup/idle memory uses natural GC; post-panel forced GC is reported separately. Summed process working sets can include shared pages, so they are not unique physical memory. No real workspace or credential is used; this optional benchmark is outside `verify`.

Panel latency records the browser input event through the dialog's open mutation and two animation frames, separately from Playwright's polling-dependent automation time. `GOALLOOM_STARTUP_ITEMS=0` or `100` narrows a diagnostic run; `GOALLOOM_STARTUP_SCRIPTS=0` disables debugger-based script inspection when isolating measurement overhead.

Playwright 控制真实窗口，并关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。退出草稿的消息框回答桩只验证逻辑；原生对话框、IME、安装/升级与睡眠仍由负责人验收。

`feedback.mjs` uses actual UI actions and authoritative IPC fixtures. Its multi-item plan case calls the mounted Composer submit callback, preserving the real write and receipt path without a cloud provider; it does not claim Jev analysis acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
