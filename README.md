# Goalloom

**把三个月的方向，连接到今天的行动。**

个人本地 Todo，把时间看板与目标关联放在一起：

```text
Later → 3个月 → 本月 → 本周 → 今天
```

时间列回答「什么时候做」，关联回答「为什么做」。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite · TypeSafe SDK（Jev，可选）。

**状态：** 文档 v0.8.0；已实现首次配置、SQLite 持久化、极简五列看板、多父 DAG 与互斥流程颜色、独立状态/回收站及效果字段撤销；只读历史与往期批量处理；自动顺延、批次撤销、日常备份与安全整库恢复/重置；智能输入（全局 composer、可跳过的 Jev 连接、TypeSafe 原生 / Vercel AI Gateway / OpenRouter 三渠道、可编辑预览与 `createPlan` 整批事务/同代次撤销、迁移前保护副本）；外观支持纸感/简约两种风格 × 明暗模式与三种复选框样式（schema v5）。智能输入的各渠道真实 Key 联调、标注样例评估与双平台安装包验收尚待负责人执行，见功能规格。首版开发、自动化与两平台私人打包已完成；双平台人工验收由负责人执行。已确认多父 DAG、固定三日历月、macOS 14+ Apple Silicon / Windows 11 x64、中/英/日/西/法五种界面语言（默认跟随系统，可在设置切换）与负责人本人内测，持续按里程碑验证。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。

| 文档 | 用途 |
| --- | --- |
| [智能输入功能规格](docs/features/smart-input.md) | 全局输入、Jev 三渠道、Onboarding、计划创建/撤销、导出恢复与迁移保护的规则、工程契约、TODO 与验收 |
| [关系线功能规格](docs/features/relation-lines.md) | 单流程筛选时的上下级连线、悬停链、跨级与滚出视野规则、设置开关、工程契约与验收 |
| [开发代理约定](AGENTS.md) | 通用业务/安全约束、文档维护、代码组织、执行与权限规则 |

每个功能的产品规则、工程契约、TODO 与验收集中在 `docs/features/` 下的一份规格，不另建重复文件；变更过程和测试结果记录在 Git / PR 中。`CLAUDE.md` 仅导入 `AGENTS.md`，不另维护一套规则。

## 开发

Node >=22.12，包管理器为 pnpm 11.9.0（`packageManager` 锁定，Corepack 可自动启用）；`pnpm install --frozen-lockfile` 安装锁定依赖与 Electron。依赖构建脚本白名单与扁平 `node_modules` 设置见 `pnpm-workspace.yaml`。测试使用 Electron 自带 Node/SQLite，无外部数据库驱动。

```sh
pnpm dev                  # Electron 开发预览
pnpm typecheck            # TypeScript strict
pnpm test                 # 领域 / SQLite 集成 / 主进程 / 前端库
pnpm test:electron        # 真实 Electron main 的 SQLite 探针
pnpm build                # 三入口与生产产物约束检查
pnpm test:ui              # 真实窗口业务闭环与 CSP/IPC/主题
pnpm test:history         # 独立夹具的历史/往期/hold 窗口验证
pnpm test:recovery        # 保护备份/维护/重置/SQLite 恢复与暂停
pnpm test:composer        # 可跳过 Onboarding、全局 composer、列头＋键盘路径与 Tab 步数
pnpm test:language        # 系统语言侦测、配置页/设置即时切换、main 与 worker 文案、重启保持、en/es/fr 无漏译
pnpm test:relations       # 单流程筛选的关系线、悬停链、滚出视野标记与设置开关持久化
pnpm test:review          # Review 缺陷、长列键盘/拖放、真实 preload 边界回归
pnpm test:performance     # 四组启动、页面搜索、110 次面板往返及传输峰值
pnpm test:large-backup    # 360 条长说明、超过 100 MiB 备份的重置/完整恢复
pnpm test:scaling         # 200/400/800 项批次增长曲线
pnpm build:debug          # 正式构建 + 不入包的私有源码映射与逐字节匹配检查
pnpm package:dir          # 当前平台本地目录包
```

`package:mac` / `package:win` 只生成私人测试产物，默认不发布；完成后自动校验语言白名单、包内文件与体积预算。`package:experiment <label> [normal|maximum]` 生成两平台独立清单、SHA256、构建/解压时间。产物位于 `release/Goalloom-0.1.0-mac-arm64.zip` 与 `release/Goalloom-0.1.0-win-x64.exe`；前者解压为应用，后者为中文 x64 安装器。两者均未签名，macOS 未公证，使用默认 Electron 应用图标。自动更新与公开分发不在当前范围。

默认工作区位于 macOS `~/Library/Application Support/Goalloom/` 或 Windows `%APPDATA%\Goalloom\`，备份位于其中的 `backups/`。应用内“设置与数据”可查看位置和恢复副本；卸载不主动删除工作区，覆盖升级保持同一应用身份和数据目录。智能输入的 Jev Key 由系统钥匙串/凭据保护加密保存在 `smart-input/`，不进入工作区数据库、导出或备份。真机、原生对话框、安装/升级、IME、睡眠与各渠道真实 Key 验收由负责人完成，待验项集中在功能规格。

`pnpm test:ui <本机应用可执行文件>` 验证已打包窗口。测试截图只写入忽略的 `output/tests/screenshots/`；许可证自动汇总到包内 `out/THIRD_PARTY_NOTICES.txt`。合入 `main` 前在本地运行 `pnpm verify`（单元/集成 → SQLite → 构建 → 看板/历史/恢复/composer/多语言与 Review 回归窗口测试）。GitHub Actions 仅手动触发（免费版无私有仓库托管分钟数）；Windows x64 与实机输入、安装/升级验收由负责人另行完成。

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
.github/workflows/      # 私人仓库 macOS/Windows 托管 VM 验证配置
docs/features/          # 按功能维护的单一规格（规则/契约/TODO/验收）
out/                    # 忽略：生产编译产物
release/                # 忽略：私人安装包与目录包
output/tests/           # 忽略：测试夹具、截图、性能与安装包实验
output/private-debug/   # 忽略：本机诊断源码映射、对应代码与哈希，不随包分发
```

`electron.vite.config.ts` 管理三入口/worker；`electron-builder.yml` 固定 app 身份、中文 NSIS 1.2.1 工具包与私人打包目标；`tsconfig.json` 开启严格检查；`components.json` 约定 shadcn 与 Hugeicons。复杂边界维护 INPUT/OUTPUT/POS，功能规则与验收只在对应功能规格。

按职责维护边界：业务服务在 `main/workspace`，持久化适配器在 `main/storage`；前端专属组件随 feature 放置，共用 UI 才进入 components。测试场景放在 tests，通用运行/构建工具放在 scripts。框架自动发现的配置保留在项目根，详情见各模块 README。
