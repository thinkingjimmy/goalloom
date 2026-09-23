# Goalloom

**把三个月的方向，连接到今天的行动。**

个人本地 Todo，把时间看板与目标关联放在一起：

```text
Later → 3个月 → 本月 → 本周 → 今天
```

时间列回答「什么时候做」，关联回答「为什么做」。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite。

**状态：** 文档 v0.7.0；已实现首次配置、SQLite 持久化、五列看板、多父 DAG、独立状态/回收站及效果字段撤销；历史/顺延/整库恢复继续按 TODO 推进，双平台里程碑尚未验收。已确认多父 DAG、固定三日历月、macOS 14+ Apple Silicon / Windows 11 x64、中文与负责人本人内测，持续按里程碑验证。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。

| 文档 | 用途 |
| --- | --- |
| [产品需求](docs/PRD.md) | 功能、状态与入口、时间规则、历史 / 顺延和待定事项 |
| [技术方案与开发 TODO](docs/TODO.md) | 工程约束、数据契约、分阶段任务与验收 |
| [开发代理约定](AGENTS.md) | 文档维护、代码组织、执行与权限规则 |

产品规则在 PRD 维护，技术与验收在 TODO 维护；变更过程和测试结果记录在 Git / PR 中。`CLAUDE.md` 仅导入 `AGENTS.md`，不另维护一套规则。设计参考保留在 `docs/references/`，仅供私人讨论。

## 开发

Node >=22.12；`npm ci` 安装锁定依赖与 Electron。测试使用 Electron 自带 Node/SQLite，无外部数据库驱动。

```sh
npm run dev              # Electron 开发预览
npm run typecheck        # TypeScript strict
npm test                 # 领域 / repository / 安全与色板
npm run test:electron    # 真实 Electron main 的 SQLite 探针
npm run build            # 三入口与生产产物约束检查
npm run test:ui          # 构建后在真实 Electron 窗口验证 CSP/IPC/主题
npm run package:dir      # 当前平台本地目录包
```

`package:mac` / `package:win` 只生成私人测试产物，默认不发布。macOS 包未配置签名/公证；自动更新与公开分发不在当前范围。

`node scripts/test-desktop.mjs <本机应用可执行文件>` 验证已打包窗口。测试截图只写入忽略的 `output/playwright/`；许可证自动汇总到包内 `out/THIRD_PARTY_NOTICES.txt`。CI 的 macOS ARM64 / Windows x64 托管 VM 检查与实机输入、安装/升级验收分别追踪。

## 代码地图

```text
src/
├── domain/             # 可独立测试的日历、DAG、候选与效果字段撤销库
├── main/               # Electron 生命周期、安全边界与 storage worker
├── preload/            # 沙箱 contextBridge，只暴露有限 API
├── renderer/           # React 五列/状态/详情、会话撤销、Hugeicons 与配对主题
└── shared/contracts/   # main/preload/renderer 共享 DTO 与运行时校验
tests/                  # 领域 / repository / Electron 验证
scripts/                # 隔离测试 runner 与生产构建检查
.github/workflows/      # 私人仓库 macOS/Windows 托管 VM 验证配置
docs/                   # PRD、工程 TODO 和私人设计参考
```

`electron.vite.config.ts` 管理三入口/worker；`electron-builder.yml` 固定 app 身份与私有打包目标；`tsconfig.json` 开启严格检查；`components.json` 约定 shadcn 与 Hugeicons。复杂边界维护 INPUT/OUTPUT/POS，产品规则只在 PRD，工程验收只在 TODO。
