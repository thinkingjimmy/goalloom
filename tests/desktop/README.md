# desktop/

> 父级：[tests](../README.md)。真实 Electron 运行测试；可复用源码入口与已打包程序。

```text
desktop/
├── sqlite.mjs           # 单独构建/启动真实 main 的内置 SQLite 探针
├── workspace.mjs        # 看板业务、流程筛选快捷键与快捷键设置（截图 settings-shortcuts.png）、协议/CSP/IPC、主题与窄窗口
├── history.mjs          # 历史/往期/hold、恢复后的缓存与会话隔离
├── recovery.mjs         # 保护备份/维护/重置/SQLite 恢复与重启暂停
├── composer-live.mjs    # 可选：真实 OpenRouter Jev（需 .env.local Key）连接、默认采用 Jev 的上级推荐、↵ 创建并核对看板/关联/说明，截图作证据；不进 verify
├── composer.mjs         # 首次流程、全局 composer 普通 Later/会话草稿与关闭后的真实保存回执、列头＋Enter/Space 与 Tab 步数、拆解
├── performance.mjs      # 大数据夹具、存储延迟与窗口启动/内存
├── relations.mjs        # 关系线：单流程筛选画线/跨级虚线/其余置灰、悬停与聚焦链、滚出视野标记、设置开关持久化（截图 relation-lines*.png）
├── language.mjs         # 系统语言侦测、配置页/设置即时切换、main/worker 文案、重启保持与 en/es/fr 漏译检查（截图 language-*.png、output/tests/language.json）
├── dialogs.mjs          # 操控真实原生保存/打开对话框的验收入口，保存 JSON 证据和恢复后截图
├── review/              # 已确认缺陷、输入/维护竞态、长列、wire、增长曲线和大备份回归
└── fixtures/
    ├── sqlite-probe.ts  # Electron main 的驱动/事务/恢复探针
    ├── history-seed.ts  # 正式事务生成历史样本，无生产测试时钟
    └── performance.ts   # 10,000 条目/1,000 活跃及真实历史，测恢复与延迟
```

从仓库根调用 `pnpm test:electron`、`test:ui`、`test:history`、`test:recovery`、`test:composer`、`test:language`、`test:relations`、`test:performance`。其余窗口脚本在隔离 profile 写入 `preferences.json` 固定中文，断言不随本机系统语言变化。`composer.mjs` 把 Tab 步数写入 `output/tests/composer.json`。窗口脚本接受可执行文件路径，例如 `pnpm test:ui release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`。`dialogs.mjs` 需要人工操作，不纳入自动检查。

夹具各自构建到 `output/tests/build/{sqlite,history,performance}/`，避免清空其他场景的文件；截图在 `output/tests/screenshots/`，性能记录在 `output/tests/performance/`。这些目录全部忽略，不进入正式包。

Playwright 控制真实窗口，并关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。退出草稿的消息框回答桩只验证逻辑；原生对话框、IME、安装/升级与睡眠仍由负责人验收。

[PROTOCOL]: Update this header when making changes, then check README.md.
