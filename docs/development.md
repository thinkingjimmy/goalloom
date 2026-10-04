# Goalloom 开发文档

> 项目地图（L1）。面向贡献者与开发代理；用户向介绍见 [README](../README.md) / [中文 README](README.zh-CN.md)。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite · TypeSafe SDK（Jev，可选）。

**状态：** 文档 v0.8.0；已实现首次配置、SQLite 持久化、Later 与六个固定时间列、多父 DAG 与互斥流程颜色、独立状态/回收站及效果字段撤销；往期任务编辑、不可变历史与往期批量处理；自动顺延、批次撤销、日常备份与安全整库恢复/重置；智能输入（全局 composer、可跳过的 Jev 连接、OpenRouter / Vercel AI Gateway 两渠道（TypeSafe 原生已于 2026-10-03 下线）、可编辑预览与 `createPlan` 整批事务/同代次撤销、v6 起不再原地升级，旧数据经导入恢复）；外观支持纸感/简约两种风格 × 明暗模式与三种复选框样式（schema v6）。智能输入的各渠道真实 Key 联调、标注样例评估与双平台安装包验收尚待负责人执行，见功能规格。首版开发、自动化与两平台私人打包已完成；双平台人工验收由负责人执行。已确认多父 DAG、年 / 半年 / 3个月按 12 / 6 / 3 日历月从原始起点推导的双日历模式、macOS 14+ Apple Silicon / Windows 11 x64、中/英/日/西/法五种界面语言（默认跟随系统，可在设置切换）与负责人本人内测，持续按里程碑验证。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。首个公开版本 1.0.0 已在 GitHub Releases 发布（MIT 许可证），官网为 https://www.goalloom.com 。

| 文档 | 用途 |
| --- | --- |
| [智能输入功能规格](features/smart-input.md) | 全局输入、Jev 两渠道、Onboarding、计划创建/撤销与旧版导入恢复的规则、工程契约、TODO 与验收 |
| [关系线功能规格](features/relation-lines.md) | 单流程筛选时的上下级连线、悬停链、跨级与滚出视野规则、设置开关、工程契约与验收 |
| [快捷键功能规格](features/shortcuts.md) | 默认键位、流程筛选位置键、改键与冲突规则、工程契约与验收 |
| [自动排序功能规格](features/board-ordering.md) | 最近一级上级排序、本机开关、关闭保存、拖动与连续重排动效及验收 |
| [完成反馈功能规格](features/completion-feedback.md) | 按可见性反馈去向、静默操作、逐列撒花、提示与动效生命周期及撤销验收 |
| [双日历模式](features/calendar-modes.md) | 年 / 半年列、365 天与自然年、三步向导、手动升级与六级 AI 契约 |
| [周期规划功能规格](features/period-planning.md) | 待办右键顺延、统一前后周期浏览、往期任务编辑与未来规划、按周期草稿、事务和查询边界及验收 |
| [流程洞察功能规格](features/flow-insight.md) | 单流程断点 ＋ 与跳级补里程碑、空列卡、周/月/合并复盘、分组右键菜单、设置 › 洞察与 DeepSeek Flash 起草通道 |
| [链接预览功能规格](features/link-previews.md) | 混排短链接、真实预览、多链接横滑、历史数据按需展示、网络/缓存边界及验收 |
| [Task descriptions](features/task-descriptions.md) | In-place Markdown, inline page titles/favicons, source preservation and the board signal + read-only peek |
| [关于与软件更新](features/updates.md) | 设置 › 关于、真实版本与图标、macOS 应用菜单、GitHub Releases 自动更新、红点提示与发布资产清单 |
| [官网功能规格](features/website.md) | 卖点叙事、官网页面/动效/多语言规则、工程契约与验收 |
| [开发代理约定](../AGENTS.md) | 通用业务/安全约束、文档维护、代码组织、执行与权限规则 |

每个功能的产品规则、工程契约、TODO 与验收集中在 `docs/features/` 下的一份规格，不另建重复文件；变更过程和测试结果记录在 Git / PR 中。`CLAUDE.md` 仅导入 `AGENTS.md`，不另维护一套规则。

## 开发

Node >=22.12，包管理器为 pnpm 11.9.0（`packageManager` 锁定，Corepack 可自动启用）；`pnpm install --frozen-lockfile` 安装锁定依赖与 Electron。依赖构建脚本白名单与扁平 `node_modules` 设置见 `pnpm-workspace.yaml`。测试使用 Electron 自带 Node/SQLite，无外部数据库驱动。

日历计算使用锁定 Electron 44.4.4 的原生 Temporal（main、worker 和 renderer）；`@js-temporal/polyfill` 仅提供开发期类型，不进入正式包。领域测试与智能输入评测都使用 Electron 自带 Node；升级 Electron 时须复核原生 Temporal、DST 和三个月锚点行为。

```sh
pnpm dev                  # Electron preview; watches main/preload and hot-reloads the renderer
pnpm typecheck            # TypeScript strict
pnpm test                 # 领域 / SQLite 集成 / 主进程 / 前端库
pnpm test:electron        # 真实 Electron main 的 SQLite 探针
pnpm build                # 三入口与生产产物约束检查
pnpm test:ui              # 真实窗口业务闭环与 CSP/IPC/主题
pnpm test:task-focus      # Todo 详情关闭后的鼠标/键盘焦点返回，普通/链接标题与四主题
pnpm test:calendar        # 双日历向导、年/半年、未来拆解、旧 v5 导入保真与五语言四主题
pnpm test:later           # 固定时间列、Later 侧栏、独立滚动、拖放、动效及本机展开偏好
pnpm test:history         # 独立夹具的历史/往期/hold 窗口验证
pnpm test:ordering        # Parent ordering, atomic materialization/undo, group drag and measured motion
pnpm test:periods         # Context menus, future periods, drafts, sorting, undo, clock boundaries and restart
pnpm test:insight         # 流程洞察：断点、空列卡、预填新建、跳级、复盘与设置（无模型路径）
pnpm test:insight-generation # Development/production generation, summary cache/restart/refresh/recovery and Settings trials with synthetic HTTP
pnpm test:insight-live    # 可选：真实 OpenRouter（.env.local Key）下的起草与复盘小结
pnpm test:links           # Link previews, mixed text, carousel, browser opening, legacy data and offline cache
pnpm test:descriptions    # Rich Markdown editing, semantic links, clipboard, save races and length guards
pnpm test:feedback        # Contextual Toasts, modal recovery actions and feedback timing
pnpm test:recovery        # 保护备份/维护/重置/SQLite 恢复与暂停
pnpm test:composer        # 可跳过 Onboarding、全局 composer、列头＋键盘路径与 Tab 步数
pnpm test:due-dates       # Shared deadline calendar, keyboard/month boundaries, draft-only saves, themes and locale screenshots
pnpm test:composer-live   # 可选：真实 OpenRouter Jev 下的新建全流程（Key 放 .env.local）
pnpm eval:smart           # 真实 OpenRouter 评测智能输入（Key 放 .env.local），报告写入 output/eval/
pnpm test:language        # 系统语言侦测、配置页/设置即时切换、main 与 worker 文案、重启保持、en/es/fr 无漏译
pnpm test:relations       # 单流程筛选的关系线、悬停链、滚出视野标记与设置开关持久化
pnpm test:celebration     # 逐列完成撒花、静默移动／完成、撤销、减少动态效果与重启偏好
pnpm test:review          # Review 缺陷、长列键盘/拖放、真实 preload 边界回归
pnpm test:performance     # 四组启动、页面搜索、110 次面板往返及传输峰值
pnpm test:large-backup    # 360 条长说明、超过 100 MiB 备份的重置/完整恢复
pnpm test:scaling         # 200/400/800 项批次增长曲线
pnpm build:debug          # 正式构建 + 不入包的私有源码映射与逐字节匹配检查
pnpm package:dir          # 当前平台本地目录包
```

`package:mac` / `package:win` 只生成私人测试产物，默认不发布；完成后自动校验语言白名单、包内文件与体积预算。`package:experiment <label> [normal|maximum]` 生成两平台独立清单、SHA256、构建/DMG 安装时间。产物位于 `release/Goalloom-<版本>-mac-arm64.dmg` 与 `release/Goalloom-<版本>-win-x64.exe`；前者为拖拽安装的磁盘映像，后者为中文 x64 安装器。macOS 包在本机有 Developer ID 证书时自动签名但未公证，Windows 包未签名，安装方式见[中文 README 的「首次打开」](README.zh-CN.md#首次打开)；应用图标来自 `resources/icon.png`。公开版本以 [GitHub Releases](https://github.com/thinkingjimmy/goalloom/releases) 分发（首个公开版本 1.0.0），官网下载按钮指向同一批资产。正式包经 electron-updater 从 GitHub Releases 自动更新：打包同时生成 macOS zip 与 `latest-mac.yml` / `latest.yml`，发布时须随安装包一起上传，清单见[关于与软件更新](features/updates.md#工程契约)。许可证：[MIT](../LICENSE)。

默认工作区位于 macOS `~/Library/Application Support/Goalloom/` 或 Windows `%APPDATA%\Goalloom\`，备份位于其中的 `backups/`。应用内“设置与数据”可查看位置和恢复副本；卸载不主动删除工作区，覆盖升级保持同一应用身份和数据目录。智能输入的 Jev Key 由系统钥匙串/凭据保护加密保存在 `smart-input/`，不进入工作区数据库、导出或备份。真机、原生对话框、安装/升级、IME、睡眠与各渠道真实 Key 验收由负责人完成，待验项集中在功能规格。

`pnpm test:ui <本机应用可执行文件>` 验证已打包窗口。测试截图只写入忽略的 `output/tests/screenshots/`；许可证自动汇总到包内 `out/THIRD_PARTY_NOTICES.txt`。

## 测试范围

年 / 半年与双日历模式的跨功能范围见 [功能规格 §11.1](features/calendar-modes.md#111-e2e-范围按-docsdevelopmentmd-的映射)；包含新增 `test:calendar`、向导跨午夜 renderer 场景、六列规划与年 / 半年起草，按下表去重。

日常功能验收范围 = **本次新增／修改场景的 E2E ＋ 所属功能的全部 E2E**。不要求运行其他功能，也不以仓库全量通过作为功能完成、提交、push 或合入 `main` 的条件。执行规则以 [AGENTS.md](../AGENTS.md#validation-scope) 为准，下表维护功能与现有脚本的映射。

- 开发中只跑当前需要验证的场景；完成后跑齐受影响功能。新增／修改场景若已在该功能脚本中通过，无需重复跑；多个功能共用的命令只执行一次。通过后仅在相关代码变化或出现失败时重跑。
- 运行前简述受影响功能、所选命令及理由。按用户行为和共享契约判断影响，不按改动文件数量扩大范围；共用组件、状态、IPC、存储只追加实际受影响的功能。其他脚本仅把某功能作为初始化步骤，不算该功能的专门覆盖。
- 优先使用脚本实际支持的场景／分组入口，例如 `node tests/desktop/review/run.mjs virtual`；不要默认执行整个 `test:review`。没有筛选能力的混合脚本按完整脚本运行，并说明粒度限制，不因此追加其他套件。新增或迁移用例时同步更新下表。
- 桌面代码改动保留快速检查 `pnpm typecheck`、`pnpm test`（全部 Vitest）；源码桌面 E2E 前先 `pnpm build`。纯文档、规则或不影响行为的注释修改只检查 diff、链接和命令，无需类型检查、Vitest、构建或 E2E。

| 受影响功能／行为 | 对应脚本与追加条件 |
| --- | --- |
| Onboarding／首次配置：日历选择、年方向与确认、AI 服务连接／跳过、首次语言选择 | `pnpm test:ui` ＋ `pnpm test:composer` ＋ `pnpm test:language` ＋ `pnpm test:calendar`；日期刷新/确认变化追加 `node tests/desktop/review/renderer.mjs`；仅当重置后重新进入向导的逻辑也受影响时追加 `pnpm test:recovery` |
| [年 / 半年与双日历模式](features/calendar-modes.md)：六尺度周期、模式与起点、年方向、未来拆解、旧库导入 | `pnpm test:calendar`；共享契约涉及的其余功能按规格 §11.1 和本表去重，真实模型测试经负责人授权执行 |
| 看板、条目详情、设置框架、主题、preload 暴露面、CSP / 窗口安全 | `pnpm test:ui`；设置内的具体功能按所属行选择，不能因入口都在设置就追加全部功能 |
| Empty-column typography shared by current/future boards, Later and empty history | `pnpm test:ui` + `pnpm test:language` + `pnpm test:later` + `pnpm test:history`; initial-board screenshot and measured glyph lines in `output/tests/empty-column/` |
| Detail More alignment/actions and removal of board navigation | `pnpm test:ui` (includes `fixtures/detail-more.mjs`) + `pnpm test:language` + `pnpm test:periods` + `pnpm test:later` + `pnpm test:history` + `node tests/desktop/review/run.mjs renderer virtual`; More geometry in `output/tests/detail-more/`, search/detail-close behavior in the owning period/Later/virtual reports |
| Todo detail focus return: pointer/Esc, keyboard continuation, plain/rich titles and virtual-row identity | `pnpm test:task-focus` + `pnpm test:ui` + `node tests/desktop/review/run.mjs virtual`; reports and before/after screenshots in `output/tests/task-focus/` |
| [关于与软件更新](features/updates.md)：设置 › 关于、macOS 应用菜单、更新阶段、顶栏／导航红点 | `pnpm test:updates`；改动 `main/update.ts`、打包 `publish`／mac zip 目标或发布资产时，在 macOS 追加可选的 `pnpm test:update-install`（需 Developer ID，真实签名包 + 本地更新源） |
| [Later 固定侧栏](features/later-sidebar.md)：固定时间列、旧显隐偏好处理、Later 数量与开关、滚动隔离、草稿／焦点、动效与收起时的搜索详情 | `pnpm test:later` ＋ `pnpm test:ui`；共享拖放／视口边界改变时，追加 `test:composer`、`test:language`、`test:ordering`、`test:periods`、`test:relations`、`test:insight`、`test:insight-generation`、`test:links`、`test:feedback`、`test:celebration` 及 `node tests/desktop/review/run.mjs virtual`，按下方各功能映射去重 |
| [Deadline calendar](features/due-dates.md): detail/composer date selection, presets, focus and localization | `pnpm test:due-dates` + `pnpm test:ui` + `pnpm test:composer` + `pnpm test:language`; composer adjustment uses `node tests/desktop/review/renderer.mjs --calendar` with mocked IPC |
| 历史、往期、活动记录 | `pnpm test:history` |
| 右键顺延、周期浏览、显式周期写入和查询 | `pnpm test:periods`（含列头与动效）；开发中可用 `pnpm test:periods --navigation` 单独反馈，功能完成运行整个脚本；影响往期浏览时追加 `pnpm test:history`；报告及截图位于 `output/tests/periods/` |
| 流程洞察：筛选／圆点预览断点 ＋（含 `fixtures/preview-breakpoints.mjs`）、空列卡、复盘、设置 › 洞察、draft/review 通道；断点加载旋转／原色／减少动态效果／失败回退、AI 服务连接（Onboarding 成功路径）、设置 › AI 服务与账户失败状态由 `test:insight-generation` 覆盖 | `pnpm test:insight` ＋ `pnpm test:insight-generation` ＋ `node tests/desktop/month-review.mjs` ＋ `node tests/desktop/month-review.mjs --combined`；复盘入口／标题文案变化追加 `pnpm test:language`；影响共用的周期右键菜单时追加 `pnpm test:periods`；真实模型联调另用 `pnpm test:insight-live` |
| 链接解析、预览、横滑、外部浏览器与缓存 | `pnpm test:links`（含旧缓存补 favicon、官方图标传输、长链接自然换行与离线重启）；开发时可用 `node tests/desktop/link-previews.mjs --inline`；公共服务实时可用性独立核验 |
| Detail autosave and native close/quit: debounce, immediate properties, failure/receipt recovery and draft draining | `pnpm test:autosave` + `pnpm test:ui` + `pnpm test:descriptions` + `pnpm test:links` + `pnpm test:due-dates` + `pnpm test:language` + `node tests/desktop/review/run.mjs renderer lifecycle`; native close changes also retain composer quit confirmation coverage in `test:autosave` |
| Detail titles: complete rich reading, raw editing, saved-only links and focus/autosave guards | `pnpm test:links` + `pnpm test:ui` + `pnpm test:language` + `node tests/desktop/review/run.mjs renderer`; development selector: `node tests/desktop/link-previews.mjs --titles`. Editing integration is also owned by `test:descriptions`, `test:history` and `test:periods`. |
| [Task descriptions](features/task-descriptions.md): rich editing/task lists, first-line alignment, selection-tool placement, source/clipboard semantics, saved-only enrichment and inline titles/icons | `pnpm test:descriptions` + `pnpm test:ui` + `pnpm test:links` + `pnpm test:language` + `node tests/desktop/review/run.mjs renderer virtual`; development selectors: `node tests/desktop/descriptions.mjs --editing`, `--checklists`, `--selection-tools`, `--alignment` or `--signals` (board signal and peek). Prototypes are a separate browser comparison, not desktop acceptance. |
| 备份、JSON 导入导出、恢复、重置 | `pnpm test:recovery`；维护态与重载相关再跑 `node tests/desktop/review/run.mjs lifecycle` |
| composer、智能输入、快捷新建（列头／todo 末尾／空白双击） | `pnpm test:composer`（含 `fixtures/column-add.mjs` 的七列、草稿、显示周期、禁用、虚拟列表、五语言与四主题）；开发选择器 `node tests/desktop/composer.mjs --column-add`，证据 `output/tests/column-add/`；保存回执/草稿竞态再跑 `node tests/desktop/review/run.mjs renderer` |
| 多语言文案、语言切换（含五语言复盘入口与弹窗标题） | `pnpm test:language`；preload 校验文案再跑 `node tests/desktop/review/run.mjs wire` |
| 自动排序、分组拖动、重排动效 | `pnpm test:ordering`；私有报告、截图与录像位于 `output/tests/ordering/` |
| 关联、流程颜色、关系线、圆点菜单及拖拽关联：实际流程候选过滤、独立上级承接起点／一次撤销 | `pnpm test:relations`（包含独立 `relation-drag.mjs` 与权威事务／JSON／SQLite 夹具）；菜单文案／宽度变化追加 `pnpm test:language`；开发可用 `node tests/desktop/relation-drag.mjs`，候选过滤／原子起点上移证据位于 `output/tests/relation-drag/`；效果导入校验变化追加 `pnpm test:recovery`，筛选身份变化按下行覆盖；菜单尺寸证据在 `output/tests/flow-dot-position.json` 与 `output/tests/screenshots/flow-dot-position-*.png` |
| 顶栏流程筛选、数字快捷键及启停 | `pnpm test:ui` ＋ `pnpm test:relations` ＋ `pnpm test:history`（从往期返回当期、重复选择、输入保护与未来草稿）；周期选择逻辑受影响时追加 `pnpm test:periods` |
| 完成反馈、撒花 | `pnpm test:celebration` ＋ `pnpm test:feedback`；影响往期还原反馈时追加 `pnpm test:history` |
| 长列、虚拟滚动、拖放、键盘移动 | `node tests/desktop/review/run.mjs virtual` |
| SQLite 驱动、存储 worker、旧库只读拒绝与导入 | `pnpm test:electron` ＋ 实际受影响功能的脚本；v5/v6 保真追加 `test:calendar`，大数据量相关再跑 `node tests/desktop/review/run.mjs large-workspace` |
| 打包脚本、包体报告 | `node tests/desktop/review/run.mjs package-report` |
| `src/domain` 领域规则 | 改变用户可见行为时按所属功能选 E2E；不影响行为的内部调整保留快速检查，无需桌面脚本 |
| 官网 `website/` | 在该目录运行 `pnpm typecheck`、`pnpm test:e2e`（包含构建）；不跑桌面 E2E，细节见 [官网 README](../website/README.md) |
| 纯文档、规则、不影响行为的注释 | diff、链接和命令检查；无需应用测试或构建 |

**例：只改 Onboarding。** 先完成快速检查与构建，再运行 `pnpm test:ui`、`pnpm test:composer`、`pnpm test:language`、`pnpm test:calendar`，包括本次修改的场景。这些脚本覆盖跳过方向／日历配置、方向保存／Jev 可跳过流程、首次语言切换和双模式／年底方向；修改日期刷新或跨夜确认时，另跑 `node tests/desktop/review/renderer.mjs` 的模拟时钟场景。目前没有 Onboarding 专用筛选入口，因此以包含这些断言的脚本为最小可运行范围。无需追加历史、恢复、关系线、撒花、洞察等独立套件；只有其行为实际受影响时才追加。其他套件启动时经过向导不构成追加理由。

完整 `pnpm verify` 仅在发布新版本前或负责人明确要求全量验证时运行。性能、增长曲线、大备份、真实服务联调按改动需要或明确要求单独执行，不作为每个功能的固定门槛。功能规格里已勾选的全量验收是历史记录，不要求后续每次修改重跑全量。

交付时记录测试范围、实际命令、结果和可重复验证的报告／截图路径（忽略的 `output/tests/`）；执行桌面测试时同时记录 Electron / Node / SQLite 版本和 OS / CPU / VM／实机范围。未运行的无关套件属于范围外，需运行但失败或受阻的用例如实标明，不能将局部通过表述为全量或安装包验收通过。

### 桌面测试干扰

- 同机操作导致的意外失焦、遮挡或输入干扰，先作为测试环境问题排查；单次超时既不能证明产品缺陷，也不能直接归咎于用户操作。区分系统窗口失焦与应用内部焦点丢失，保留功能规格要求的重排焦点保持、菜单关闭焦点恢复、隐藏窗口停止动效等用例。
- 新增焦点／可见性回归必须对应明确的产品契约，或在受控环境中可复现的用户可见缺陷，并记录需求／复现步骤、预期和实际结果；优先补充所属功能的现有场景。不得仅为应对测试期间使用电脑，就新增场景、修改产品行为、扩大超时、叠加固定等待或抢焦点／重试循环。
- 失败时先看应用自身的焦点／可见性、活动元素、输入目标及已有截图／日志，不采集其他应用的屏幕内容。有证据确认环境干扰且消除原因后，只补跑受影响场景一次；不支持单场景入口时跑最小包含脚本，使用全新隔离测试数据，不重跑其他已通过的功能。
- 环境仍不满足前提时，将相应用例明确标为“环境干扰，尚未验证”；原因不明则保留待排查，不能直接跳过、标为通过或认定产品缺陷。依赖前台的测试优先放到隔离桌面运行，不靠反复抢焦点或要求负责人停止使用电脑维持测试；其他独立工作继续推进。

GitHub Actions 仅手动触发（免费版无私有仓库托管分钟数）；Windows x64 与实机输入、安装/升级验收由负责人另行完成。

## 代码地图

```text
src/
├── domain/             # 独立纯函数库：日历、DAG、流程归属、候选、历史、效果字段撤销、计划拓扑与 smart/ 智能输入规则
├── main/               # Electron 生命周期、IPC 和安全边界
│   ├── update.ts       # electron-updater（GitHub Releases）检查/下载/重启安装与阶段推送
│   ├── window/         # 窗口偏好、退出保护与 macOS 应用菜单
│   ├── smart/          # AI 服务：Jev 与 DeepSeek 的 OpenRouter / Gateway 两渠道 adapter、设备凭据与独立异步服务
│   ├── link-preview/   # Public URL metadata/image requests and disposable bounded device cache
│   ├── storage/        # SQLite/v6 新库与旧库只读拒绝/备份/文件适配器与 worker 通道
│   └── workspace/      # 业务事务、commands、历史/顺延与 transfer
├── preload/            # 沙箱 contextBridge，只暴露有限 API
├── renderer/
│   ├── features/       # shell（顶栏/搜索/设置）、board、items、setup、composer、smart 功能
│   ├── components/     # 跨功能 UI 原语、Hugeicons 与 shadcn Button
│   ├── state/          # 工作区快照、流程派生、会话撤销与提交协调
│   ├── i18n/           # 五语言界面文案（locales/*）、即时切换视图与 Intl 格式
│   └── lib/            # 色板、日期与样式纯工具
└── shared/
    ├── contracts/      # main/preload/renderer 共享 DTO 与运行时校验
    └── i18n/           # Locale 解析与 main/worker/domain 的服务端文案（catalogs/*）
tests/                  # domain、main、renderer、integration 与 desktop
scripts/                # 测试运行器与 build 构建工具
resources/              # 打包资源：应用图标 icon.png（1024，macOS 圆角底板），electron-builder 生成 icns/ico
.github/workflows/      # 私人仓库 macOS/Windows 托管 VM 验证配置
docs/                   # 开发文档（本文件）、中文 README 与 features/ 下按功能维护的单一规格（规则/契约/TODO/验收）
website/                # 官网：独立 pnpm 根的 Next.js 静态导出，五语言、部署到 Vercel（见 website/README.md）
images/                 # README 截图
out/                    # 忽略：生产编译产物
release/                # 忽略：私人安装包与目录包
output/tests/           # 忽略：测试夹具、截图、性能与安装包实验
output/private-debug/   # 忽略：本机诊断源码映射、对应代码与哈希，不随包分发
```

`electron.vite.config.ts` 管理三入口/worker；`electron-builder.yml` 固定 app 身份、中文 NSIS 1.2.1 工具包与私人打包目标；`tsconfig.json` 开启严格检查；`components.json` 约定 shadcn 与 Hugeicons。复杂边界维护 INPUT/OUTPUT/POS，功能规则与验收只在对应功能规格。

按职责维护边界：业务服务在 `main/workspace`，持久化适配器在 `main/storage`；前端专属组件随 feature 放置，共用 UI 才进入 components。测试场景放在 tests，通用运行/构建工具放在 scripts。框架自动发现的配置保留在项目根，详情见各模块 README。
