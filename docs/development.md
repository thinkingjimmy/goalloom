# Goalloom 开发文档

> 项目地图（L1）。面向贡献者与开发代理；用户向介绍见 [README](../README.md) / [中文 README](README.zh-CN.md)。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite · TypeSafe SDK（Jev，可选）。

**状态：** 文档 v0.8.0；已实现首次配置、SQLite 持久化、极简五列看板、多父 DAG 与互斥流程颜色、独立状态/回收站及效果字段撤销；只读历史与往期批量处理；自动顺延、批次撤销、日常备份与安全整库恢复/重置；智能输入（全局 composer、可跳过的 Jev 连接、TypeSafe 原生 / Vercel AI Gateway / OpenRouter 三渠道、可编辑预览与 `createPlan` 整批事务/同代次撤销、迁移前保护副本）；外观支持纸感/简约两种风格 × 明暗模式与三种复选框样式（schema v5）。智能输入的各渠道真实 Key 联调、标注样例评估与双平台安装包验收尚待负责人执行，见功能规格。首版开发、自动化与两平台私人打包已完成；双平台人工验收由负责人执行。已确认多父 DAG、固定三日历月、macOS 14+ Apple Silicon / Windows 11 x64、中/英/日/西/法五种界面语言（默认跟随系统，可在设置切换）与负责人本人内测，持续按里程碑验证。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。首个公开版本 1.0.0 已在 GitHub Releases 发布（MIT 许可证），官网为 https://www.goalloom.com 。

| 文档 | 用途 |
| --- | --- |
| [智能输入功能规格](features/smart-input.md) | 全局输入、Jev 三渠道、Onboarding、计划创建/撤销、导出恢复与迁移保护的规则、工程契约、TODO 与验收 |
| [关系线功能规格](features/relation-lines.md) | 单流程筛选时的上下级连线、悬停链、跨级与滚出视野规则、设置开关、工程契约与验收 |
| [快捷键功能规格](features/shortcuts.md) | 默认键位、流程筛选位置键、改键与冲突规则、工程契约与验收 |
| [完成反馈功能规格](features/completion-feedback.md) | 按可见性反馈去向、静默操作、逐列撒花、提示与动效生命周期及撤销验收 |
| [官网功能规格](features/website.md) | 卖点叙事、官网页面/动效/多语言规则、工程契约与验收 |
| [开发代理约定](../AGENTS.md) | 通用业务/安全约束、文档维护、代码组织、执行与权限规则 |

每个功能的产品规则、工程契约、TODO 与验收集中在 `docs/features/` 下的一份规格，不另建重复文件；变更过程和测试结果记录在 Git / PR 中。`CLAUDE.md` 仅导入 `AGENTS.md`，不另维护一套规则。

## 开发

Node >=22.12，包管理器为 pnpm 11.9.0（`packageManager` 锁定，Corepack 可自动启用）；`pnpm install --frozen-lockfile` 安装锁定依赖与 Electron。依赖构建脚本白名单与扁平 `node_modules` 设置见 `pnpm-workspace.yaml`。测试使用 Electron 自带 Node/SQLite，无外部数据库驱动。

日历计算使用锁定 Electron 44.4.4 的原生 Temporal（main、worker 和 renderer）；`@js-temporal/polyfill` 仅提供开发期类型，不进入正式包。领域测试与智能输入评测都使用 Electron 自带 Node；升级 Electron 时须复核原生 Temporal、DST 和三个月锚点行为。

```sh
pnpm dev                  # Electron 开发预览
pnpm typecheck            # TypeScript strict
pnpm test                 # 领域 / SQLite 集成 / 主进程 / 前端库
pnpm test:electron        # 真实 Electron main 的 SQLite 探针
pnpm build                # 三入口与生产产物约束检查
pnpm test:ui              # 真实窗口业务闭环与 CSP/IPC/主题
pnpm test:history         # 独立夹具的历史/往期/hold 窗口验证
pnpm test:feedback        # Contextual Toasts, modal recovery actions and feedback timing
pnpm test:recovery        # 保护备份/维护/重置/SQLite 恢复与暂停
pnpm test:composer        # 可跳过 Onboarding、全局 composer、列头＋键盘路径与 Tab 步数
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

`package:mac` / `package:win` 只生成私人测试产物，默认不发布；完成后自动校验语言白名单、包内文件与体积预算。`package:experiment <label> [normal|maximum]` 生成两平台独立清单、SHA256、构建/DMG 安装时间。产物位于 `release/Goalloom-<版本>-mac-arm64.dmg` 与 `release/Goalloom-<版本>-win-x64.exe`；前者为拖拽安装的磁盘映像，后者为中文 x64 安装器。macOS 包在本机有 Developer ID 证书时自动签名但未公证，Windows 包未签名，安装方式见[中文 README 的「首次打开」](README.zh-CN.md#首次打开)；应用图标来自 `resources/icon.png`。公开版本以 [GitHub Releases](https://github.com/thinkingjimmy/goalloom/releases) 分发（首个公开版本 1.0.0），官网下载按钮指向同一批资产；自动更新不在当前范围。许可证：[MIT](../LICENSE)。

默认工作区位于 macOS `~/Library/Application Support/Goalloom/` 或 Windows `%APPDATA%\Goalloom\`，备份位于其中的 `backups/`。应用内“设置与数据”可查看位置和恢复副本；卸载不主动删除工作区，覆盖升级保持同一应用身份和数据目录。智能输入的 Jev Key 由系统钥匙串/凭据保护加密保存在 `smart-input/`，不进入工作区数据库、导出或备份。真机、原生对话框、安装/升级、IME、睡眠与各渠道真实 Key 验收由负责人完成，待验项集中在功能规格。

`pnpm test:ui <本机应用可执行文件>` 验证已打包窗口。测试截图只写入忽略的 `output/tests/screenshots/`；许可证自动汇总到包内 `out/THIRD_PARTY_NOTICES.txt`。完整 `pnpm verify`（单元/集成 → SQLite → 构建 → 看板/历史/恢复/composer/多语言与 Review 回归窗口测试）只在发布版本前运行；push 或合入 `main` 不要求。

日常改完一个功能：`pnpm typecheck && pnpm test`，再按改动模块只跑对应的桌面脚本（先 `pnpm build`；跨多个模块就各跑各的）：

| 改动位置 | 桌面脚本 |
| --- | --- |
| 看板、条目详情、设置、主题、preload 暴露面、CSP / 窗口安全 | `pnpm test:ui` |
| 历史、往期、活动记录 | `pnpm test:history` |
| 备份、JSON 导入导出、恢复、重置 | `pnpm test:recovery`；维护态与重载相关再跑 `node tests/desktop/review/run.mjs lifecycle` |
| composer、智能输入、快捷新建 | `pnpm test:composer`；保存回执/草稿竞态再跑 `node tests/desktop/review/run.mjs renderer` |
| 多语言文案、语言切换 | `pnpm test:language`；preload 校验文案再跑 `node tests/desktop/review/run.mjs wire` |
| 关联、流程颜色、关系线 | `pnpm test:relations` |
| 完成反馈、撒花 | `pnpm test:celebration` / `pnpm test:feedback` |
| 长列、虚拟滚动、拖放、键盘移动 | `node tests/desktop/review/run.mjs virtual` |
| SQLite 驱动、存储 worker、迁移 | `pnpm test:electron`；大数据量再跑 `node tests/desktop/review/run.mjs large-workspace` |
| 打包脚本、包体报告 | `node tests/desktop/review/run.mjs package-report` |
| 只改 `src/domain` / 纯文档 | 无需桌面脚本 |

GitHub Actions 仅手动触发（免费版无私有仓库托管分钟数）；Windows x64 与实机输入、安装/升级验收由负责人另行完成。

## 代码地图

```text
src/
├── domain/             # 独立纯函数库：日历、DAG、流程归属、候选、历史、效果字段撤销、计划拓扑与 smart/ 智能输入规则
├── main/               # Electron 生命周期、IPC 和安全边界
│   ├── window/         # 窗口偏好与退出保护
│   ├── smart/          # Jev 三渠道 adapter、设备凭据与独立异步智能服务
│   ├── storage/        # SQLite/启动迁移保护/备份/文件适配器与 worker 通道
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
