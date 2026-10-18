# Goalloom 开发文档

> 项目地图（L1）。面向贡献者与开发代理；用户向介绍见 [README](../README.md) / [中文 README](README.zh-CN.md)。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite · TypeSafe SDK（Jev，可选）。

**状态：** 文档 v0.8.0；已实现首次配置、SQLite 持久化、Later 与六个固定时间列、多父 DAG 与互斥流程颜色、独立状态/回收站及效果字段撤销；往期任务编辑、不可变历史与往期批量处理；自动顺延、批次撤销、日常备份与安全整库恢复/重置；智能输入（全局 composer、可跳过的 Jev 连接、OpenRouter / Vercel AI Gateway 两渠道（TypeSafe 原生已于 2026-10-03 下线）、可编辑预览与 `createPlan` 整批事务/同代次撤销、v6 起不再原地升级，旧数据经导入恢复）；外观支持纸感/简约两种风格 × 明暗模式与三种复选框样式（schema v7）。智能输入的各渠道真实 Key 联调、标注样例评估与双平台安装包验收尚待负责人执行，见功能规格。首版开发、自动化与两平台私人打包已完成；双平台人工验收由负责人执行。已确认多父 DAG、年 / 半年 / 3个月按 12 / 6 / 3 日历月从原始起点推导的双日历模式、macOS 14+ Apple Silicon / Windows 11 x64、中/英/日/西/法五种界面语言（默认跟随系统，可在设置切换）与负责人本人内测，持续按里程碑验证。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。首个公开版本 1.0.0 已在 GitHub Releases 发布（MIT 许可证），官网为 https://www.goalloom.com 。

| 文档 | 用途 |
| --- | --- |
| [智能输入功能规格](features/smart-input.md) | 全局输入、Jev 两渠道、Onboarding、计划创建/撤销与旧版导入恢复的规则、工程契约、TODO 与验收 |
| [关系线功能规格](features/relation-lines.md) | 单流程筛选时的上下级连线、悬停链、跨级与滚出视野规则、设置开关、工程契约与验收 |
| [快捷键功能规格](features/shortcuts.md) | 默认键位、流程筛选位置键、改键与冲突规则、工程契约与验收 |
| [自动放置与整理规格](features/board-ordering.md) | 事件触发的局部放置、自由手排、单列单次整理及原子撤销 |
| [完成反馈功能规格](features/completion-feedback.md) | 按可见性反馈去向、静默操作、逐列撒花、提示与动效生命周期及撤销验收 |
| [双日历模式](features/calendar-modes.md) | 年 / 半年列、365 天与自然年、三步向导、手动升级与六级 AI 契约 |
| [周期规划功能规格](features/period-planning.md) | 待办右键顺延、统一前后周期浏览、往期任务编辑与未来规划、按周期草稿、事务和查询边界及验收 |
| [流程洞察功能规格](features/flow-insight.md) | 单流程断点 ＋ 与跳级补里程碑、空列卡、周/月/合并复盘、分组右键菜单、设置 › 洞察与 DeepSeek Flash 起草通道 |
| [链接预览功能规格](features/link-previews.md) | 混排短链接、真实预览、多链接横滑、历史数据按需展示、网络/缓存边界及验收 |
| [Task descriptions](features/task-descriptions.md) | In-place Markdown, inline page titles/favicons, source preservation and the board signal + read-only peek |
| [Task assistance](features/Goalloom-Smart-Assistance-PRD-TODO-v1.1.md) | Explicit note rewriting, description-owned undo, execution facts and protective legacy workspace upgrade |
| [关于与软件更新](features/updates.md) | 设置 › 关于、真实版本与图标、macOS 应用菜单、GitHub Releases 自动更新、红点提示与发布资产清单 |
| [官网功能规格](features/website.md) | 卖点叙事、官网页面/动效/多语言规则、工程契约与验收 |
| [开发代理约定](../AGENTS.md) | 通用业务/安全约束、文档维护、代码组织、执行与权限规则 |

Current desktop data uses schema v11. Phase 0 sync is the v9 step (in-place from v8: history tables that do not pin projection rows, sync tables and `base_*` shadows). v10 adds two-level nesting and mirrors the column, index and triggers onto `base_*`. v11 adds immutable creation/completion receipt ownership and grouped inverse validation. v8-v10 upgrade in place after a verified protective backup; v1-v7 stay on the confirmed protective-copy path. Task assistance keeps description-owned undo. Shared mobile/local-store projections remain v10 because v11 changes desktop receipt semantics, not business columns. Legacy workspace replacement retains its two explicit startup confirmations.

每个功能的产品规则、工程契约、TODO 与验收集中在 `docs/features/` 下的一份规格，不另建重复文件；变更过程和测试结果记录在 Git / PR 中。`CLAUDE.md` 仅导入 `AGENTS.md`，不另维护一套规则。

## 开发

Node >=22.12，包管理器为 pnpm 11.9.0（`packageManager` 锁定，Corepack 可自动启用）；`pnpm install --frozen-lockfile` 安装锁定依赖与 Electron。依赖构建脚本白名单与扁平 `node_modules` 设置见 `pnpm-workspace.yaml`。测试使用 Electron 自带 Node/SQLite，无外部数据库驱动。

日历计算使用锁定 Electron 44.4.4 的原生 Temporal（main、worker 和 renderer）；`@js-temporal/polyfill` 仅提供开发期类型，不进入正式包。领域测试与智能输入评测都使用 Electron 自带 Node；升级 Electron 时须复核原生 Temporal、DST 和三个月锚点行为。Vitest 的入口是 `pnpm test`（`node apps/desktop/scripts/test.mjs`，用 Electron 的 Node 启动）。不要用 `npx vitest` 或 `pnpm exec vitest`：系统 Node 没有原生 Temporal，日历测试会失败。`apps/desktop/tests/setup-temporal.ts` 在缺少 Temporal 时直接说明这一点。

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
pnpm test:ordering        # Local automatic placement, free manual order, scoped arrangement/undo, nesting and wrapped drag titles
pnpm test:periods         # Context menus, future periods, drafts, sorting, undo, clock boundaries and restart
pnpm test:insight         # 流程洞察：断点、空列卡、预填新建、跳级、复盘与设置（无模型路径）
pnpm test:insight-generation # Development/production generation, summary cache/restart/refresh/recovery and Settings trials with synthetic HTTP
pnpm test:insight-live    # 可选：真实 OpenRouter（.env.local Key）下的起草与复盘小结
pnpm test:links           # Link previews, mixed text, carousel, browser opening, legacy data and offline cache
pnpm test:descriptions    # Rich Markdown editing, semantic links, clipboard, save races and length guards
pnpm test:feedback        # Contextual Toasts, modal recovery actions and feedback timing
pnpm test:recovery        # 保护备份/维护/重置/SQLite 恢复与暂停
pnpm test:composer        # 可跳过 Onboarding、全局 composer、列头＋键盘路径与 Tab 步数
pnpm test:subtasks        # Two-level nesting, group moves, inherited goals, undo, recovery and native detail/keyboard evidence
pnpm test:due-dates       # Shared deadline calendar, keyboard/month boundaries, draft-only saves, themes and locale screenshots
pnpm test:composer-live   # 可选：真实 OpenRouter Jev 下的新建全流程（Key 放 .env.local）
pnpm eval:smart           # 真实 OpenRouter 评测智能输入（Key 放 .env.local），报告写入 output/eval/
pnpm test:language        # 系统语言侦测、配置页/设置即时切换、main 与 worker 文案、重启保持、en/es/fr 无漏译
pnpm test:relations       # 单流程筛选的关系线、悬停链、滚出视野标记与设置开关持久化
pnpm test:celebration     # 逐列完成撒花、静默移动／完成、撤销、减少动态效果与重启偏好
pnpm test:review          # Review 缺陷、长列键盘/拖放、真实 preload 边界回归
pnpm test:performance     # 可选：四组启动、页面搜索、50 次面板往返及传输峰值（仅 release 前）
pnpm test:scaling         # 可选：200/400/800 项批次增长曲线（仅 release 前）
pnpm test:large-workspace # Manual: 32,769/100,000 tasks; excluded from verify and test:review
pnpm build:debug          # 正式构建 + 不入包的私有源码映射与逐字节匹配检查
pnpm package:dir          # 当前平台本地目录包
```

`package:mac` / `package:win` 只生成私人测试产物，默认不发布；完成后自动校验语言白名单、包内文件与体积预算。`package:experiment <label> [normal|maximum]` 生成两平台独立清单、SHA256、构建/DMG 安装时间。产物位于 `apps/desktop/release/Goalloom-<版本>-mac-arm64.dmg` 与 `apps/desktop/release/Goalloom-<版本>-win-x64.exe`；前者为拖拽安装的磁盘映像，后者为中文 x64 安装器。macOS 包在本机有 Developer ID 证书时会签名；没有 Apple API key 时 electron-builder 跳过公证。Windows 包未签名。托管 Release 工作流则必须签名并公证，见下方。安装方式见[中文 README 的「首次打开」](README.zh-CN.md#首次打开)。1.9.0 是首个通过 Apple 公证的公开版本，README 与官网已使用正常拖拽安装说明。公开版 macOS 1.8.0 使用 ad-hoc 签名，需退出后手动安装当前正式版一次，工作区与设置保留。应用图标来自 `apps/desktop/resources/icon.png`。公开版本以 [GitHub Releases](https://github.com/thinkingjimmy/goalloom/releases) 分发（首个公开版本 1.0.0），官网下载按钮指向同一批资产。正式包经 electron-updater 从 GitHub Releases 自动更新：打包同时生成 macOS zip 与 `latest-mac.yml` / `latest.yml`。托管打包把这些资产放上草稿 Release，见下方「托管打包与草稿 Release」；自动更新要等该草稿被发布为正式版。清单见[关于与软件更新](features/updates.md#工程契约)。桌面安装包许可证：[MIT](../LICENSE)。`supabase/` 为 [AGPL-3.0-only](../supabase/LICENSE)，路径划分见根 README 的 License 一节。

性能与压力测试（`test:performance`、`test:scaling`）仅在 release 前运行，不作为日常功能验收的必要条件。

## 托管打包与草稿 Release

桌面安装包可以在 GitHub Actions 上打出，不必在本机 Mac 上执行 `package:mac` / `package:win`。工作流是 [`.github/workflows/release.yml`](../.github/workflows/release.yml)，汇总脚本是 [`.github/scripts/draft-release.sh`](../.github/scripts/draft-release.sh)。

- 触发：只在 Actions 页手动运行 `workflow_dispatch`。推送 tag 不触发工作流。没有 `pull_request` 或 `pull_request_target`，fork 的拉取请求拿不到签名 secret。手动运行默认只上传 Actions artifact，不创建、不更新、也不发布 Release；勾选 `update_draft` 后才会创建或更新草稿。tag 必须等于 `v` 加上 `apps/desktop/package.json` 的版本，且根 `package.json` 版本相同。对不上就失败，不创建 Release。
- Runner：macOS 与 Windows 先各自做 `typecheck` / `pnpm test` / `pnpm build`，这两个测试 job 不声明 environment、也不读取签名 secret。通过后 `macos-15`（arm64）才签名并公证，`windows-2025`（x64）另行打包。需要草稿时，`ubuntu-latest` 校验文件、写 `SHA256SUMS.txt` 并更新草稿；只做签名测试时这个 job 不运行。同一时间只跑一个这样的工作流。
- 托管门禁，用来代替本机完整 `pnpm verify` 里能在托管 runner 上跑的部分：`pnpm typecheck`、`pnpm test`、`pnpm build`，然后 `package:mac` / `package:win`（仍 `--publish never`，并跑现有包体报告），再跑 `ci.yml` 里已有的打包后冒烟（`tests/workspace.mjs`、`tests/history.mjs`、`tests/recovery.mjs` 指向打好的应用）。macOS job 在冒烟之前检查 `.app` 与 `.dmg`：两者都做 `codesign --verify --deep --strict`、`codesign -dv` 和 `xcrun stapler validate`。`codesign -dv` 打出签名里的 TeamIdentifier，并与 `APPLE_TEAM_ID` 比较；不相等就失败，日志不打印这个 secret。`.app` 的 Gatekeeper 评估是 `spctl -a -vv --type execute`。`.dmg` 是 `spctl -a -vvv -t open --context context:primary-signature`；不带这个 context 时，已装订的映像会被报成 `source=Insufficient Context`。包体报告在比对语言白名单前把相对路径里的反斜杠换成正斜杠。ASAR 基线采用公开版 1.9.3 的实际测量值，写在 `apps/desktop/scripts/build/package-budgets.json`（darwin-arm64 3314093 字节，win32-x64 3313867 字节）。1.9.4 的正式代码增长约 1.15%；累计跨过旧 1.8.0 基线后已审查内容并记录原因。5% 上限、下载体积与逻辑体积预算保持不变。主进程打包了 `@supabase/supabase-js`，不再把它留成运行时依赖。这不是完整 `pnpm verify`，也不代替 Windows 11 实机或负责人的安装验收。
- 上传的文件：`Goalloom-<v>-mac-arm64.dmg`、`Goalloom-<v>-mac-arm64.zip`、`Goalloom-<v>-mac-arm64.zip.blockmap`、`latest-mac.yml`、`Goalloom-<v>-win-x64.exe`、`Goalloom-<v>-win-x64.exe.blockmap`、`latest.yml`，以及与 1.6.0 相同两空格格式的 `SHA256SUMS.txt`（覆盖这七个文件，不含校验文件自身）。缺任何一个都会失败。
- 草稿 job 用自带的 `GITHUB_TOKEN` 创建或更新 tag `v<版本>` 的 draft Release。标题为 `Goalloom <版本>`，正文来自 `docs/releases/v<版本>.md`。调用只带 `--draft`，不带 `--prerelease`，也不带 `--draft=false`。已发布的 Release 直接失败，不会被改回草稿、不会被改成 prerelease、也不会被再次发布。自动更新要等负责人在 GitHub 上发布该草稿。
- 权限：工作流默认 `contents: read`。测试 job 只有这一项。两个打包 job 另有 `actions: write`，只为上传 artifact。`contents: write` 只给草稿 job；该 job 另有 `actions: read` 以下载 artifact。不使用个人 access token。第三方 action 钉在完整 commit SHA 上，行尾注释是对应的版本标签。
- 重新运行会替换草稿上的同名资产和说明。若 tag 已指向别的提交且 Release 仍是草稿，草稿目标会改到本次构建的提交。没有草稿可更新时，不会移动已有 tag。

macOS 签名 secret 放在名为 `release` 的 GitHub Environment 里，不要把证书放进仓库，也不要留在仓库级 Actions secrets。只有「Package and notarize macOS」这个 job 声明 `environment: release`。测试、Windows 打包和草稿 job 不声明它，工作流里也不引用那六个 secret。

Environment 由仓库管理员创建，工作流不会替你建：

1. 打开仓库 Settings → Environments → New environment，名称填 `release`。
2. Deployment branches and tags 选 Selected branches and tags。加上分支 `main`，再加上 tag 规则 `v*`。不要选 All branches。
3. 把下面六个 secret 建在这个 environment 里，然后从仓库级 Actions secrets 删掉同名项。留在仓库级的话，没有 `environment: release` 的 job 仍然读得到。
4. `GOALLOOM_SUPABASE_ANON_KEY` 和 `GOALLOOM_SUPABASE_URL` 仍是仓库级 secret。Windows job 不进入 `release` environment，放进去会让 Windows 包读不到。
5. 限制生效之后，手动测试必须从 `main`（或该 environment 允许的其他分支或 tag）跑。不在允许列表里的分支（例如尚未合并的功能分支）会让 macOS 签名 job 在环境规则处被拒绝，准备步骤里的「缺 secret 只报名字」检查不会执行。合并前要试跑，就把该分支临时加进 deployment branches，跑完删掉。

缺任何一个签名 secret，macOS job 失败并只打印 secret 名字，不打未签名包。

| Secret | 内容 |
| --- | --- |
| `CSC_LINK` | Developer ID Application 证书的 `.p12` 文件字节的 base64（不是磁盘路径，也不是密码）。准备步骤把它导入 `$RUNNER_TEMP/goalloom-signing.keychain-db` 一次。打包步骤不接收 `CSC_LINK` 或 `CSC_KEY_PASSWORD`，只使用 `CSC_KEYCHAIN` 指向这把钥匙串；electron-builder 再导入一次会在无界面 runner 上让 `codesign` 停在钥匙串授权。这个文件必须只包含一个身份：`Developer ID Application: ziming wang (947MAGH97Q)`。不要把第二个 Developer ID 放进同一个 `.p12`。 |
| `CSC_KEY_PASSWORD` | 该 `.p12` 的导入密码。 |
| `APPLE_API_KEY_P8` | App Store Connect API key 的原始 `.p8` 文本（不是 base64）。工作流把它写成 `$RUNNER_TEMP/AuthKey.p8`，并把路径放进 `APPLE_API_KEY`。 |
| `APPLE_API_KEY_ID` | 该 API key 的 Key ID。 |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID。 |
| `APPLE_TEAM_ID` | Apple Team ID（`947MAGH97Q`）。用于验证应用和 DMG 的签名团队。公证脚本使用 API key，不向 notarytool 传 `--team-id`。 |
| `GOALLOOM_SUPABASE_ANON_KEY` | Supabase anon key。只在打包步骤作为构建期环境变量传给 `electron-vite`，打进主进程。不要写入仓库。未设置或为空时构建仍成功，安装包里的同步保持未配置。 |
| `GOALLOOM_SUPABASE_URL` | 可选。未设置时工作流使用 `https://asqyvcnxdltzzfutbbqy.supabase.co`。 |

macOS job 要求全部签名和公证 secret 有值。`CSC_NAME` 固定为 `ziming wang (947MAGH97Q)`（不含 `Developer ID Application:` 前缀）。准备步骤设置 key partition list 并通过 `CSC_KEYCHAIN` 交给 electron-builder，避免重复导入证书。打包前解锁钥匙串，并对 `/usr/bin/true` 的副本执行带时间戳、hardened runtime 和 entitlements 的签名探针；20 秒未完成就失败。`package:mac` 保持 `--publish never`，辅助进程权限保持 JIT 与未签名可执行内存。主进程还需固定的应用标识与私有钥匙串访问组，以及匹配的 Developer ID provisioning profile。

Application notarization runs in `apps/desktop/scripts/build/notarize.mjs`, registered as the builder's `afterSign` hook. `mac.notarize: false` disables only the unbounded built-in path. The release job requires the hook with `GOALLOOM_REQUIRE_NOTARIZATION=1`; local builds without API-key credentials skip notarization. The helper uploads once with `submit --no-wait` (5-minute limit), saves the submission ID, then runs `wait --timeout 1800s` (30-minute limit). It checks status after a failed wait and saves Apple's log when available. Only `Accepted` allows ticket stapling and validation. The hook finishes before the builder creates the DMG and auto-update ZIP, so ZIP checksums and blockmaps describe the stapled app. The timestamp-signed DMG uses the same helper. No automatic resubmission occurs.

The macOS package step has a 50-minute limit; DMG notarization has 45 minutes; the job has 110 minutes. A timeout does not cancel Apple's processing. Check the saved submission ID with `notarytool info` using the same API-key credentials before another build. The `macos-notarization-diagnostics` Actions artifact is uploaded after success or failure and contains redacted `app.json` / `dmg.json` reports from `apps/desktop/output/tests/notarization/`. An `upload` stage means no completed upload was confirmed; `wait` with `In Progress` means Apple is still processing; an `Invalid` result includes Apple's rejection log when available. This evidence does not establish a cause for the earlier run's opaque 45-minute wait.

macOS still verifies `.app` and `.dmg` with codesign, expected TeamIdentifier, Gatekeeper and stapler. The app uses `spctl --type execute`; the DMG uses `spctl -t open --context context:primary-signature`. The CI workflow keeps unsigned private checks; Windows packages remain unsigned and do not read macOS signing secrets.

The release profile step reuses the existing App Store Connect API credentials to download an active `MAC_APP_DIRECT` profile for `com.goalloom.desktop` and the exact imported Developer ID certificate. API lookup is read-only by default. If no matching profile exists, the manual `create_session_profile` workflow input can create it using that existing certificate; it registers only the fixed macOS bundle ID when absent and never creates or revokes certificates. Later runs reuse the profile. The key must permit Certificates, Identifiers & Profiles access. Alternatively, supply the profile bytes as `GOALLOOM_MAC_PROVISIONING_PROFILE_B64` in the release environment. Local signing uses the `GOALLOOM_MAC_PROVISIONING_PROFILE` file path. The profile must authorize `947MAGH97Q.com.goalloom.desktop`, be unexpired, and target Developer ID distribution. Missing/mismatched profiles stop packaging; signing/notarization credentials alone do not supply these permissions. The build hook embeds the profile and applies the session entitlements to the main executable only. No secrets/profile contents enter evidence.

Provisioning failure cases, defined before adding profile creation: default lookup must not create resources; a missing or ambiguous imported signing identity must not select another certificate; an existing matching profile must be reused; an explicit one-time creation must register only the fixed macOS bundle ID when absent and use the already imported Developer ID certificate; a profile for another certificate/app/team must not pass; malformed CMS payloads and missing parser tools must fail without exposing profile contents; API denial, invalid pagination or an unknown POST outcome must stop without repeated writes. The CLI fixture records requests and uses synthetic Apple boundaries; real signed acceptance remains a release gate.

The signed macOS job also runs `tests/keychain-signed.mjs` before packaged smokes. A same-team signed probe verifies that the production main disabled Keychain UI under Hardened Runtime. Actual Data Protection Keychain checks create a synthetic private session key, restore it after a full process restart, and restore it from a replacement bundle with a different signed version and the same app/access-group identity. The fixture deletes that synthetic key. Actual Electron `safeStorage` also checks first use/restart and reads synthetic AI ciphertext created by the public 1.9.1 app. This hosted-only gate requires the runner's disposable signing keychain to be the default, never uses a local user's keychain, and uploads `macos-signed-keychain-evidence`. Old-version seeding receives a test-only noninteractive guard; the new app must set the policy itself. It does not call a live AI provider or replace physical-machine/Windows acceptance.

打包步骤把 `GOALLOOM_SUPABASE_ANON_KEY` 和 `GOALLOOM_SUPABASE_URL` 传给 `package:mac` / `package:win` 里的 `electron-vite build`。运行时先看环境变量 `GOALLOOM_SUPABASE_ANON_KEY`，再看用户数据目录里 `sync-config.json` 的 `anonKey`（可选字段 `url`），最后用打进包里的值。macOS 用户数据目录是 `~/Library/Application Support/Goalloom/`。anon key 为空只打警告，不让构建失败。`pnpm test` 不接收这把 key。

默认工作区位于 macOS `~/Library/Application Support/Goalloom/` 或 Windows `%APPDATA%\Goalloom\`，备份位于其中的 `backups/`。应用内“设置与数据”可查看位置和恢复副本；卸载不主动删除工作区，覆盖升级保持同一应用身份和数据目录。智能输入的 Jev Key 由系统钥匙串/凭据保护加密保存在 `smart-input/`，不进入工作区数据库、导出或备份。同步时 Key 只在内存里放进密封的 `pref.set`，工作区里留下的是 `sha256` 指纹；备份会删掉这些行和动作再 `VACUUM`，文件里不留 Key 的字节。真机、原生对话框、安装/升级、IME、睡眠与各渠道真实 Key 验收由负责人完成，待验项集中在功能规格。

`pnpm test:ui <本机应用可执行文件>` 验证已打包窗口。桌面脚本的工作目录是 `apps/desktop`，测试截图写入忽略的 `apps/desktop/output/tests/screenshots/`；许可证自动汇总到包内 `apps/desktop/out/THIRD_PARTY_NOTICES.txt`。

## 测试范围

年 / 半年与双日历模式的跨功能范围见 [功能规格 §11.1](features/calendar-modes.md#111-e2e-范围按-docsdevelopmentmd-的映射)；包含新增 `test:calendar`、向导跨午夜 renderer 场景、六列规划与年 / 半年起草，按下表去重。

日常功能验收范围 = **本次新增／修改场景的 E2E ＋ 所属功能的全部 E2E**。不要求运行其他功能，也不以仓库全量通过作为功能完成、提交、push 或合入 `main` 的条件。执行规则以 [AGENTS.md](../AGENTS.md#validation-scope) 为准，下表维护功能与现有脚本的映射。

Credential startup/sign-in/sign-out/recovery-feedback changes use `pnpm test:credentials` after `pnpm build`, in addition to the desktop sync row below. It covers unused/signed-out startup without OS cipher access, locked/active sign-out without cipher calls or waiting for network revocation, failed sign-out writes, cancelled/successful reauthorization, existing/legacy session restoration, independent saved AI keys, unavailable/denied/corrupt vault preservation, five-language macOS recovery guidance, access-restored restart and missing-native-policy startup without cipher calls. Sign-out scenarios retain synthetic tasks, encrypted keys and send data. Reports and native-window screenshots: `apps/desktop/output/tests/credentials/`. OS cipher and cloud responses are synthetic. Changes to the shared cipher also run `pnpm test:composer` and `pnpm test:insight-generation` for its AI consumers; localized credential feedback adds `pnpm test:language`.

Identity and noninteractive Keychain changes also run `pnpm test:ui` and `pnpm test:keychain-native`. Development uses `Goalloom Development` for the application/keychain name and default profile, while packaged builds retain `Goalloom` and its existing data directory. The macOS build needs Xcode command-line tools to compile a small Node-API v8 policy; the packager unpacks/signs it beside the main entry. The native check uses disposable private macOS keychains and synthetic secrets through the production policy. It verifies first creation, restart, silent identity/lock rejection and cleanup without editing user credential permissions. Native evidence: `apps/desktop/output/tests/keychain-native/`. Windows skips the macOS-only check and retains DPAPI. The script is included in macOS release verification; it does not establish signed packaged-upgrade acceptance.

`pnpm test:keychain-package` is an optional local package smoke after native/build integration changes. It builds a disposable ad-hoc app outside the checkout with a separate bundle ID and no protocol declarations, confirms native-module unpacking/signing/loading, and checks first use/restart/lock through the packaged main. Hardened Runtime is disabled only for that ad-hoc fixture; production settings remain unchanged. Reports/screenshots: `apps/desktop/output/tests/keychain-package/`. It neither uses a production certificate nor notarizes, publishes or replaces an installed app. Developer ID/Hardened Runtime upgrades remain release acceptance.

- 开发中只跑当前需要验证的场景；完成后跑齐受影响功能。新增／修改场景若已在该功能脚本中通过，无需重复跑；多个功能共用的命令只执行一次。通过后仅在相关代码变化或出现失败时重跑。
- 运行前简述受影响功能、所选命令及理由。按用户行为和共享契约判断影响，不按改动文件数量扩大范围；共用组件、状态、IPC、存储只追加实际受影响的功能。其他脚本仅把某功能作为初始化步骤，不算该功能的专门覆盖。
- 优先使用脚本实际支持的场景／分组入口，例如 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual`；不要默认执行整个 `test:review`。没有筛选能力的混合脚本按完整脚本运行，并说明粒度限制，不因此追加其他套件。新增或迁移用例时同步更新下表。
- 桌面代码改动保留快速检查 `pnpm typecheck`、`pnpm test`（全部 Vitest）；源码桌面 E2E 前先 `pnpm build`。纯文档、规则或不影响行为的注释修改只检查 diff、链接和命令，无需类型检查、Vitest、构建或 E2E。

| 受影响功能／行为 | 对应脚本与追加条件 |
| --- | --- |
| Shared controls, semantic theme tokens and ordinary setup/settings/composer/review layout | `pnpm --filter @goalloom/desktop exec -- node tests/style-migration.mjs` captures 68 native-window states across paper/minimal and light/dark, verifies keyboard switches, nested Select dismissal, native-dialog portal ownership and no task writes. Before a style change use `--record`; after rebuilding use `--compare` for geometry/computed-style equality. Evidence: `output/tests/style-migration/`. Also run the full mapped coverage of each affected feature below; this visual probe does not replace business acceptance. |
| Onboarding／首次配置：日历选择、年方向与确认、AI 服务连接／跳过、首次语言选择、开始页（直接使用 / Google 等待 / 加入设备密码 / 首台设备基线） | `pnpm test:ui` ＋ `pnpm test:composer` ＋ `pnpm test:language` ＋ `pnpm test:calendar`；入口分支与基线在 `pnpm test`（`start-entry`、`desktop-engine`）；日期刷新/确认变化追加 `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs`；仅当重置后重新进入向导的逻辑也受影响时追加 `pnpm test:recovery` |
| [年 / 半年与双日历模式](features/calendar-modes.md)：六尺度周期、模式与起点、年方向、未来拆解、旧库导入 | `pnpm test:calendar`；共享契约涉及的其余功能按规格 §11.1 和本表去重，真实模型测试经负责人授权执行 |
| Calendar rollover settings: six ordered manual/automatic policies, defaults, persistence, non-retroactive boundaries and batch undo | `pnpm test:calendar` (includes `fixtures/rollover-policies.ts` and native settings/restart checks); schema/import changes add `pnpm test:electron` + `pnpm test:recovery`, locale changes add `pnpm test:language`. Reports and screenshots: `output/tests/calendar-modes/`. |
| 看板、条目详情、设置框架、主题、preload 暴露面、CSP / 窗口安全 | `pnpm test:ui`（含 `fixtures/inline-title.mjs`：双击就地编辑、输入框与标题同宽同行数、Enter 只改标题、Esc／空白恢复、单击仍打开详情）；设置内的具体功能按所属行选择，不能因入口都在设置就追加全部功能 |
| Empty-column typography shared by current/future boards, Later and empty history | `pnpm test:ui` + `pnpm test:language` + `pnpm test:later` + `pnpm test:history`; initial-board screenshot and measured glyph lines in `output/tests/empty-column/` |
| Detail flow chip, single-pane notes and header lifecycle actions | `pnpm test:ui` (includes `fixtures/detail-rail.mjs`) + `pnpm test:language` + `pnpm test:periods` + `pnpm test:later` + `pnpm test:history` + `pnpm test:feedback` + `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer virtual`; header/editor geometry in `output/tests/detail-rail/`, lifecycle and search/detail-close behavior in the owning reports |
| Todo detail focus return: pointer/Esc, keyboard continuation, plain/rich titles, virtual-row identity and shared focus helper | `pnpm test:task-focus` + `pnpm test:ui` + `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual`; reports and before/after screenshots in `output/tests/task-focus/` |
| [关于与软件更新](features/updates.md)：设置 › 关于、macOS 应用菜单、更新阶段、顶栏／导航红点 | `pnpm test:updates`；改动 `main/update.ts`、打包 `publish`／mac zip 目标或发布资产时，在 macOS 追加可选的 `pnpm test:update-install`（需 Developer ID，真实签名包 + 本地更新源） |
| [Later 固定侧栏](features/later-sidebar.md)：默认时间列、旧显隐偏好处理、Later 数量与开关、滚动隔离、草稿／焦点、动效与收起时的搜索详情 | `pnpm test:later` ＋ `pnpm test:ui`；共享拖放／视口边界改变时，追加 `test:composer`、`test:language`、`test:ordering`、`test:periods`、`test:relations`、`test:insight`、`test:insight-generation`、`test:links`、`test:feedback`、`test:celebration` 及 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual`，按下方各功能映射去重 |
| [时间列显隐](features/column-visibility.md)：顶栏菜单按最长周期名收宽、勾号右对齐、最后一项置灰并在悬停时提示至少一列；六列选择、本机独立偏好、隐藏列草稿／滚动／周期、显式目标展开及共享布局 | `pnpm test:columns` ＋ `pnpm test:ui` ＋ `pnpm test:later` ＋ `pnpm test:language`；共享看板布局按 Later 行及各所属功能去重追加 `test:composer`、`test:ordering`、`test:periods`、`test:history`、`test:relations`、`test:insight`、`test:insight-generation`、`test:links`、`test:feedback`、`test:celebration`、`test:task-focus`、`pnpm --filter @goalloom/desktop exec -- node tests/month-review.mjs`、`pnpm --filter @goalloom/desktop exec -- node tests/month-review.mjs --combined` 及 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual`；报告／截图 `output/tests/column-visibility/` |
| [Deadline calendar](features/due-dates.md): detail/composer date selection, presets, focus and localization | `pnpm test:due-dates` + `pnpm test:ui` + `pnpm test:composer` + `pnpm test:language`; composer adjustment uses `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs --calendar` with mocked IPC |
| 历史、往期、活动记录 | `pnpm test:history` |
| 右键顺延、周期浏览、显式周期写入和查询 | `pnpm test:periods`（含列头与动效，以及当前月／周最右侧圆角倒数、与新建按钮共用位置、整列悬停／键盘聚焦切换与非本期隐藏）；返回图标／五语言悬停与键盘提示／单行与触控尺寸追加 `pnpm --filter @goalloom/desktop exec -- node tests/empty-card-layout.mjs --return-icons`（`output/tests/period-return/`）；该夹具也由 `pnpm test:insight` 覆盖空列同行布局；开发中可用 `pnpm test:periods --navigation` 单独反馈，功能完成运行整个脚本；影响往期浏览时追加 `pnpm test:history`；报告及截图位于 `output/tests/periods/` |
| 流程洞察：筛选／圆点预览断点 ＋（含 `fixtures/preview-breakpoints.mjs` 的无圆环按钮、整行居中及标题增高／收缩、已有周／日下级保护与退役写入拒绝）、空列卡（开发可用 `pnpm --filter @goalloom/desktop exec -- node tests/insight.mjs --empty-card` 验证尺度文案／等高按钮／批量起草与列内手写创建及 `empty-card-layout.mjs` 的 320px 五语言单行返回图标／可访问提示／同行按钮；布局证据 `output/tests/empty-card-layout/`）、复盘、设置 › 洞察、draft/review 通道；`weekly-review.mjs` 覆盖周初／周末均保留上周引导、关闭后重载保持隐藏／焦点返回／不写任务也不标完成、默认移入本周、手动保留／归档与续接、部分失败、链接标题、应用内菜单／焦点、四外观连线／幽灵按钮 hover、矩阵与各处 todo 只读、月回顾原状态／流程色 Checkbox（组件定向入口 `pnpm --filter @goalloom/desktop exec -- node tests/review-scopes.mjs`，不代表自然日期入口验收）、首行 Checkbox、紧凑无分割线条目／30px 下拉／移除批量按钮、去除行内日期、无激活边框建议编辑（开发可用 `weekly-review.mjs --draft-focus`）／父子建议层级／流程色／连续居中连线／紧凑层级／右侧自适应目标周期下拉／键盘选择与菜单关闭、跳过安排无写入与正常排入／复盘后无完成提示（含重载）／安排卡共用引导样式／当前日期／原起草行为（开发可用 `weekly-review.mjs --invitation`）／完成自动关闭与立即移除入口（开发可用 `weekly-review.mjs --completion`，含回执与撒花门控）；`fixtures/review-drafts.mjs` 覆盖建议的等待／关闭续接、编辑与排入选择保留、重新挂载缓存、来源／拆解偏好失效、无关复盘偏好复用、失败恢复及整库代次清理；断点加载旋转／原色／减少动态效果／失败回退、AI 服务连接（Onboarding 成功路径）、设置 › AI 服务与账户失败状态由 `test:insight-generation` 覆盖 | `pnpm test:insight`（包含 `weekly-review.mjs`）＋ `pnpm test:insight-generation` ＋ `pnpm --filter @goalloom/desktop exec -- node tests/month-review.mjs` ＋ `pnpm --filter @goalloom/desktop exec -- node tests/month-review.mjs --combined`；复盘入口／标题／选择文案变化追加 `pnpm test:language`；链接展示变化追加 `pnpm test:links`；影响共用的周期右键菜单时追加 `pnpm test:periods`；确定性日期／本机状态用 `pnpm test apps/desktop/tests/renderer/review.test.ts`（七种周起始日、时区／DST、整周保留、下周更新、周月重叠与关闭持久化；不替代原生验收）；真实模型联调另用 `pnpm test:insight-live` |
| 链接解析、预览、横滑、外部浏览器与缓存 | `pnpm test:links`（含旧缓存补 favicon、官方图标传输、长链接自然换行与离线重启）；开发时可用 `pnpm --filter @goalloom/desktop exec -- node tests/link-previews.mjs --inline`；公共服务实时可用性独立核验 |
| Detail autosave and native close/quit: debounce, immediate properties, failure/receipt recovery and draft draining | `pnpm test:autosave` + `pnpm test:ui` + `pnpm test:descriptions` + `pnpm test:links` + `pnpm test:due-dates` + `pnpm test:language` + `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer lifecycle`; native close changes also retain composer quit confirmation coverage in `test:autosave` |
| Empty-title detail dismissal: title-only/content guards, removal outside trash, one-step saved-title/placement undo and receipt recovery | Autosave coverage above + `pnpm test:feedback` + `pnpm test:history` + `pnpm test:periods` + `pnpm test:recovery`; development selector `pnpm --filter @goalloom/desktop exec -- node tests/autosave.mjs --discard`; native screenshots and production transaction/JSON/SQLite boundary reports under `output/tests/autosave/discard/` |
| Detail titles: complete rich reading, raw editing, persistent native undo/redo and invalid-title recovery, saved-only links and focus/autosave guards | `pnpm test:links` + `pnpm test:ui` + `pnpm test:language` + `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer`; development selector: `pnpm --filter @goalloom/desktop exec -- node tests/link-previews.mjs --titles`. Editing integration is also owned by `test:autosave`, `test:descriptions`, `test:history` and `test:periods`. |
| [Task descriptions](features/task-descriptions.md): rich editing/task lists, first-line alignment, bounded focus fill and flush saved/reopened text, selection-tool placement, source/clipboard semantics, saved-only enrichment and inline titles/icons | `pnpm test:descriptions` + `pnpm test:ui` + `pnpm test:links` + `pnpm test:language` + `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer virtual`; development selectors: `pnpm --filter @goalloom/desktop exec -- node tests/descriptions.mjs --editing`, `--checklists`, `--selection-tools`, `--alignment` or `--signals` (board signal and peek). Prototypes are a separate browser comparison, not desktop acceptance. |
| 备份、JSON 导入导出、恢复、重置 | `pnpm test:recovery`；historical milestone receipt import/undo also uses `pnpm test:calendar` (`fixtures/legacy-milestone.ts`); 维护态与重载相关再跑 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs lifecycle` |
| [任务推进辅助与执行事实](features/Goalloom-Smart-Assistance-PRD-TODO-v1.1.md)：笔记重写、选项/草稿、设置授权、自动保存/冲突/撤销、旧数据恢复、执行事实/压力及保留的数据查询 | `pnpm test:assistance`（`entry / generation / apply / undo / recovery / language / statistics`；开发选择 `pnpm test:assistance generation` 等）。`settings-navigation.mjs` 归属 entry，覆盖打开设置前的保存等待、继续输入、失败/未知回执、取消跳转和无效标题；开发选择 `pnpm --filter @goalloom/desktop exec -- node tests/assistance/settings-navigation.mjs`，证据 `output/tests/assistance/settings-navigation/report.json`。`preflight.mjs` 归属 entry/generation，覆盖开发 StrictMode、同会话替换、取消/错误归属、代次读取和待完成会话上限；两种 renderer 证据 `output/tests/assistance/preflight-*-report.json`，开发选择 `pnpm --filter @goalloom/desktop exec -- node tests/assistance/preflight.mjs --development`。`review.ts` 归属 undo/recovery/statistics，覆盖复合导入撤销、清除后的历史、撤销状态、午夜/DST、升级外观和 50,000 项批次；证据 `output/tests/assistance/review-report.json`。既有影响范围与逐命令结果在 `output/tests/assistance/regression/report.json`。`pnpm eval:assistance` 默认仅校验 60 个样例并记录跳过，真实模型需明确网络/计费授权和人工评分；不构成已验证质量。 |
| [Jev 1.14 即时创建与自动关联](features/smart-input.md)：Cmd+N、列内创建、晚到补全与一步撤销 | `pnpm test:composer` 包含 `auto-link.mjs` 与 `auto-link-storage.mjs`：真实 IPC/SQLite、受控 Jev、提前 Enter、已返回结果、连续输入、手动优先、未知回执、预算分批、多父去重、JSON/SQLite 和 v11 保护升级；定向入口 `pnpm test:auto-link` / `pnpm --filter @goalloom/desktop exec -- node tests/auto-link-storage.mjs`，证据 `apps/desktop/output/tests/auto-link/`。完整影响范围还包括 `test:relations`、`test:periods`、`test:ordering`、`test:feedback`、`test:history`、`test:recovery`、`test:electron`、`test:language`、`test:ui`、`test:sync-replay` 和 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer`，按所属功能去重。真实模型只运行 `pnpm eval:capture` 的冻结中英／URL 样例，证据在同目录的 `live/`；模拟服务验收不代表模型质量。 |
| composer、智能输入、快捷新建（列头／todo 末尾／空白双击） | `pnpm test:composer`（全局新建的单行紧凑空态、输入／多行增高、缩短／清空收回；含 `fixtures/column-add.mjs` 的七列、无键盘提示／保留流程信息、长标题折行／增高／收缩／随列宽更新、粘贴／IME、草稿、显示周期、禁用、虚拟列表、五语言与四主题）；开发选择器 `pnpm --filter @goalloom/desktop exec -- node tests/composer.mjs --column-add`，证据 `output/tests/composer.json`、`output/tests/screenshots/composer-*.png` 与 `output/tests/column-add/`；保存回执/草稿竞态再跑 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs renderer` |
| 多语言文案、语言切换（含五语言复盘入口与弹窗标题） | `pnpm test:language`；含 720px／1280px 原生窗口下设置侧栏单行、完整标签、状态间距与内容区宽度，两项暂停使用彩色图标及本地化说明，AI 服务／备份／回收站无附加信息（隔离配置与合成凭据，不连接服务）；复盘收尾下拉按内容收宽，检查五语言单行完整文案、30px 高度、右对齐及箭头间距；证据 `output/tests/language.json`、`output/tests/screenshots/language-settings-nav-*.png` 和 `language-review-choice-*.png`；preload 校验文案再跑 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs wire` |
| [二级 todo](features/subtasks.md)：中部嵌套／边缘排序、24px 缩进、继承上级／流程、独立详情／状态、整组移动／顺延、删除提升／安全还原／撤销、v10 数据与五语言 | `pnpm test:subtasks`；事务反馈选择 `pnpm test:subtasks --data`。共享行为完成覆盖：`test:ui`、`test:task-focus`、`test:later`、`test:ordering`、`test:relations`、`test:periods`、`test:calendar`、`test:history`、`test:recovery`、`test:electron`、`test:language`、`test:feedback`、`test:celebration`、`test:composer`、`test:insight`、`test:insight-generation`、`test:assistance`、`test:autosave`、`test:descriptions`、`test:links`、`test:due-dates`、`pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs wire renderer virtual lifecycle` 及月回顾的 `month-review.mjs`／`--combined` 入口，按所属功能映射去重。报告／截图位于 `output/tests/subtasks/`。 |
| 二级 todo 的分组拖放与插入：子项中部整组边框、组内首／中／末插入、一次撤销与虚拟裁剪 | `pnpm test:subtasks`（开发选择 `pnpm test:subtasks --drops`；含 `fixtures/nesting-drops.mjs` 的原生落点几何、失败／未知回执、跨组／列／未来／Later、完成折叠、长标题和未挂载父行）＋ `pnpm test:ordering` ＋ `pnpm test:sync-replay` ＋ `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs wire virtual`；证据 `output/tests/subtasks/report.json`、`group-*.png`、`transactions.json` 和对应套件报告。 |
| 二级 todo 的成功反馈：拖拽／菜单／回执恢复静默，快捷键撤销保留提示 | `pnpm test:subtasks` ＋ `pnpm test:feedback`；仅调整 `nest` 的反馈选择时按此范围验证，报告／截图在 `output/tests/subtasks/` 和 `output/tests/feedback.json` |
| 已完成任务原位／折叠设置与默认值 | `pnpm test:completed-layout` ＋ `test:ui`、`test:later`、`test:columns`、`test:subtasks`、`test:ordering`、`test:relations`、`test:periods`、`test:history`、`test:composer`、`test:language`、`test:feedback`、`test:celebration` 及 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual`；旧折叠场景经 `fixtures/completed-layout.mjs` 明确开启，新默认、坐标与顺序证据在 `output/tests/completed-layout/`。类型／同步校验由 `pnpm typecheck` 和现有 `pnpm test` 覆盖。 |
| 自动放置、自由手排、单次整理 | `pnpm test:ordering`；定向选择 `pnpm test:ordering --auto-placement`（创建／批量／关联的局部放置、显式插入、同次撤销／恢复、单列周期范围、自由鼠标／键盘排序、嵌套、五语言与浮层完整标题）和 `pnpm test:ordering --edge-sorting`（12 个边缘落点／取消／撤销）；证据在 `output/tests/ordering/` 同名子目录。旧的持续分组限制用例已由自由手排用例替代。共享拖拽浮层变化追加 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual` |
| 关联、流程颜色、关系线、圆点菜单及拖拽关联：实际流程候选过滤、独立上级承接起点／一次撤销 | `pnpm test:relations`（包含独立 `relation-drag.mjs` 与权威事务／JSON／SQLite 夹具）；菜单文案／宽度变化追加 `pnpm test:language`；开发可用 `pnpm --filter @goalloom/desktop exec -- node tests/relations.mjs --flow-dot` 定向验证简洁标题／搜索／已关联选项／浮层定位（`output/tests/flow-dot-panel/`）或 `pnpm --filter @goalloom/desktop exec -- node tests/relation-drag.mjs`，候选过滤／原子起点上移证据位于 `output/tests/relation-drag/`；效果导入校验变化追加 `pnpm test:recovery`，筛选身份变化按下行覆盖；菜单尺寸证据在 `output/tests/flow-dot-position.json` 与 `output/tests/screenshots/flow-dot-position-*.png` |
| 顶栏流程筛选、数字快捷键及启停 | `pnpm test:ui` ＋ `pnpm test:relations` ＋ `pnpm test:history`（从往期返回当期、重复选择、输入保护与未来草稿）；周期选择逻辑受影响时追加 `pnpm test:periods` |
| 完成反馈、撒花（复盘完成的自动退出／单次播放开发可用 `pnpm --filter @goalloom/desktop exec -- node tests/weekly-review.mjs --completion`） | `pnpm test:celebration` ＋ `pnpm test:feedback`；影响往期还原反馈时追加 `pnpm test:history` |
| 长列、虚拟滚动、拖放、键盘移动 | `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs virtual` |
| SQLite 驱动、存储 worker、旧库只读拒绝与导入 | `pnpm test:electron` ＋ 实际受影响功能的脚本；v5/v6 导入 v7 保真追加 `test:calendar`，大数据量检查通过 `pnpm test:large-workspace` 手动选择，不纳入默认验证 |
| 同步协议 v1：SyncOp、v9、影子基线、发送状态、加密构造 | `pnpm test` 中的 `apps/desktop/tests/integration/upgrade-v9.test.ts`、`apps/desktop/tests/integration/sync-emit.test.ts`、`apps/desktop/tests/integration/sync-emit-commands.test.ts`、`packages/tests/sync/phase0.test.ts`、`packages/tests/sync/applier-review.test.ts`、`packages/tests/sync/phase0-prototype.test.ts`、`packages/tests/sync/adversarial.test.ts`、`packages/tests/sync/desktop-engine.test.ts`、`packages/tests/sync/settings-sync.test.ts`、`packages/tests/sync/review-fixes.test.ts`、`packages/crypto/test/constructs.test.ts`、`packages/crypto/test/parity.test.ts`。Node 摘要是 `pnpm parity:digest`。托管双端原型是 `pnpm test:phase0`（需要 `supabase/README.md` 里的三个 API 变量）。托管库用例见 `supabase/README.md`（`supabase db push`、`supabase test db --db-url`、`node scripts/supabase-remote.mjs`），不是桌面 E2E。schema 变化仍追加 `pnpm test:electron` 与 `pnpm test:recovery` |
| 桌面同步：Google 登录、同步密码、两台电脑汇合（含 `item.nest`） | `pnpm test:sync-join` 验证空 B 先注册、已有任务 A 自动接入、编号/日历保留、退出重登去重、删除保留、失败回滚、并发接入和原生合并界面；证据 `apps/desktop/output/tests/sync-join/`。`pnpm test:sync-replay` 验证双端加密重放中的重复关联、原子拒绝、待发回执保留、存储失败重试，以及创建／补全／整组撤销／还原和远端修改后撤回的补全保护，使用 Electron SQLite 和合成 remote，证据在 `apps/desktop/output/tests/sync-replay/`。`pnpm test` 保留 `packages/tests/sync/desktop-engine.test.ts`、`packages/tests/sync/settings-sync.test.ts`、`packages/tests/sync/review-fixes.test.ts`、`apps/desktop/tests/main/sync-config.test.ts`、`apps/desktop/tests/main/oauth-callback.test.ts`、`apps/desktop/tests/main/protocol.test.ts`、`apps/desktop/tests/main/smart.test.ts` 与 `apps/desktop/tests/renderer/sync-pane.test.ts`。设置文案变化追加 `pnpm test:language`。`sync_settings` 用 `CREATE TABLE IF NOT EXISTS` 追加，不改 `user_version`，因此不单为同步追加 `test:electron` / `test:recovery`。操作清单见 [docs/sync/desktop.md](sync/desktop.md) |
| 同步差异确认：并发本机修改、按任务只读对比、逐项确认 | `pnpm test:sync-review` 验证生产 service/SDK/SQLite 的因果判断、字段保护、明确恢复、过期预览、原子确认、重登/重启持久化，以及真实 renderer/preload/IPC 的默认 radio、无编辑、同任务归组、丢回包查回执、失败停留、五语言和完成直接关闭；证据 `output/tests/sync-review/`。所属覆盖为 `test:sync-replay`、`test:sync-join`、`test:language` 和常规 `pnpm test`/`pnpm build`。不改 schema 版本或登录/安全存储规则。 |
| Sync security/recovery: sign-out cleanup, pinned workspaces, safe password recovery and network restoration | `pnpm test:sync-security` covers real service/SDK/SQLite fault cases and five-language native UI/IPC; `pnpm test:sync-security:packaged` repeats the UI workflows in a disposable instrumented ad-hoc macOS ASAR app. Reports/screenshots/ASAR: `output/tests/sync-security/`. Also run `test:sync-join`, `test:sync-replay`, `test:sync-scheduling`, `test:credentials`, `test:language` and `test:recovery`. First-run recovery requires the Onboarding row (`test:ui`, `test:composer`, `test:language`, `test:calendar`). Hosted SQL uses `node scripts/sync-security-hosted.mjs`. With authorized test API keys, `pnpm test:sync-security:live` verifies real Auth password sessions, HTTP/RPC, private Realtime and scoped cleanup; evidence: `output/tests/sync-security/live/`. Google provider UI, Developer ID and Windows acceptance remain separate. |
| 同步成本优化：调度、请求生命周期、上传冷却与读取 | `pnpm test:sync-scheduling` 冻结旧基线，验证生产 SyncService / SDK / 存储 worker、四小时合成时钟、真实窗口、五语言冷却提示和双端收敛；证据 `apps/desktop/output/tests/sync-cost/`。所属覆盖还包括 `pnpm test:sync-replay`、`pnpm test:credentials`、`pnpm test:language`；整库替换取消还运行 `pnpm test:recovery`。托管 SQL、并发额度、Cron 与真实广播另见 `supabase/README.md`，不以合成服务代验。 |
| 打包脚本、包体报告、公证流程 | `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs package-report notarization`；公证 CLI/hook 使用合成 Apple 工具，证据在 `apps/desktop/output/tests/notarization-fixture/`；真实 Apple 公证与打包后冒烟仍由 release workflow 验证 |
| `apps/desktop/src/domain` 领域规则 | 改变用户可见行为时按所属功能选 E2E；不影响行为的内部调整保留快速检查，无需桌面脚本 |
| 官网 `apps/website/` | 在该目录运行 `pnpm typecheck`、`pnpm test:e2e`（包含构建）；不跑桌面 E2E，细节见 [官网 README](../apps/website/README.md) |
| 纯文档、规则、不影响行为的注释 | diff、链接和命令检查；无需应用测试或构建 |

**例：只改 Onboarding。** 先完成快速检查与构建，再运行 `pnpm test:ui`、`pnpm test:composer`、`pnpm test:language`、`pnpm test:calendar`，包括本次修改的场景。这些脚本覆盖跳过方向／日历配置、方向保存／Jev 可跳过流程、首次语言切换和双模式／年底方向；修改日期刷新或跨夜确认时，另跑 `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs` 的模拟时钟场景。目前没有 Onboarding 专用筛选入口，因此以包含这些断言的脚本为最小可运行范围。无需追加历史、恢复、关系线、撒花、洞察等独立套件；只有其行为实际受影响时才追加。其他套件启动时经过向导不构成追加理由。

**完整 `pnpm verify` 仅在发布新版本前或负责人明确要求全量验证时运行。** 性能、增长曲线、真实服务联调按改动需要或明确要求单独执行，不作为每个功能的固定门槛。功能规格里已勾选的全量验收是历史记录，不要求后续每次修改重跑全量。

**10 万任务检查仅保留手动入口：** `pnpm test:large-workspace` 不随 `pnpm verify`、`pnpm test:review` 或 review runner 的默认场景执行，发布时也不会自动追加。

**日常功能开发不运行性能测试：** `test:performance` 和 `test:scaling` 是 release-only 验证，用于在发布前确认整体性能边界。功能开发、提交、push 和合入 `main` 均不需要运行这些测试。

交付时记录测试范围、实际命令、结果和可重复验证的报告／截图路径（忽略的 `output/tests/`）；执行桌面测试时同时记录 Electron / Node / SQLite 版本和 OS / CPU / VM／实机范围。未运行的无关套件属于范围外，需运行但失败或受阻的用例如实标明，不能将局部通过表述为全量或安装包验收通过。

### 桌面测试干扰

- 同机操作导致的意外失焦、遮挡或输入干扰，先作为测试环境问题排查；单次超时既不能证明产品缺陷，也不能直接归咎于用户操作。区分系统窗口失焦与应用内部焦点丢失，保留功能规格要求的重排焦点保持、菜单关闭焦点恢复、隐藏窗口停止动效等用例。
- 新增焦点／可见性回归必须对应明确的产品契约，或在受控环境中可复现的用户可见缺陷，并记录需求／复现步骤、预期和实际结果；优先补充所属功能的现有场景。不得仅为应对测试期间使用电脑，就新增场景、修改产品行为、扩大超时、叠加固定等待或抢焦点／重试循环。
- 失败时先看应用自身的焦点／可见性、活动元素、输入目标及已有截图／日志，不采集其他应用的屏幕内容。有证据确认环境干扰且消除原因后，只补跑受影响场景一次；不支持单场景入口时跑最小包含脚本，使用全新隔离测试数据，不重跑其他已通过的功能。
- 环境仍不满足前提时，将相应用例明确标为“环境干扰，尚未验证”；原因不明则保留待排查，不能直接跳过、标为通过或认定产品缺陷。依赖前台的测试优先放到隔离桌面运行，不靠反复抢焦点或要求负责人停止使用电脑维持测试；其他独立工作继续推进。

`.github/workflows/ci.yml` 仅手动触发，做更宽的桌面检查，不创建 Release，macOS 打包保持未签名，也不使用 `release` environment。`release.yml` 同样只手动运行，在托管 macOS arm64 与 Windows x64 上打包；只有 macOS 签名 job 进入 `release` environment 并公证。只有手动勾选 `update_draft` 时才更新草稿 Release，见上文「托管打包与草稿 Release」。Windows 11 实机输入、安装与升级验收仍由负责人完成。

## 代码地图

```text
apps/
├── desktop/                 # Electron 桌面（工作区包 @goalloom/desktop，产品版本为 package.json 的 1.8.0）
│   ├── src/                 # domain、main、preload、renderer、shared
│   ├── tests/               # Vitest（domain/main/renderer/integration）与真实 Electron 场景
│   ├── scripts/             # Electron Vitest 运行器、eval 与打包检查
│   ├── resources/icon.png   # 应用图标；electron-builder 生成 icns/ico
│   ├── electron.vite.config.ts
│   ├── electron-builder.yml # 产物目录 apps/desktop/release
│   └── components.json
├── mobile/                  # Expo 客户端；单独安装，不进入根 workspace
└── website/                 # 官网：独立 pnpm 根，不并入根 workspace（见 apps/website/README.md）
packages/                    # @goalloom/contracts、crypto、schema、store-core、sync
├── crypto/test/             # 加密向量与构造测试
└── tests/sync/              # 跨 sync/store-core/crypto 与桌面存储的同步测试
scripts/                     # 仓库级脚本：parity digest、phase0、supabase、向量生成
supabase/                    # 同步服务端；留在根目录供 Supabase CLI 使用，AGPL-3.0-only
docs/                        # 开发文档、中文 README、功能规格、README 截图（docs/images）
.github/workflows/           # ci.yml 手动桌面检查；release.yml 托管打包并更新草稿 Release
apps/desktop/out/            # 忽略：生产编译产物
apps/desktop/release/        # 忽略：私人安装包与目录包
apps/desktop/output/tests/   # 忽略：桌面测试夹具、截图、性能与安装包实验
apps/desktop/output/private-debug/ # 忽略：本机诊断源码映射，不随包分发
```

`apps/desktop/electron.vite.config.ts` 管理三入口/worker；`apps/desktop/electron-builder.yml` 固定 app 身份、中文 NSIS 1.2.1 工具包与私人打包目标；根目录 `tsconfig.json` 与 `vitest.config.ts` 覆盖桌面源码、桌面 Vitest 和 `packages` 下的加密/同步测试；`apps/desktop/components.json` 约定 shadcn 与 Hugeicons。复杂边界维护 INPUT/OUTPUT/POS，功能规则与验收只在对应功能规格。

按职责维护边界：业务服务在 `apps/desktop/src/main/workspace`，持久化适配器在 `apps/desktop/src/main/storage`；前端专属组件随 feature 放置，共用 UI 才进入 components。桌面测试场景放在 `apps/desktop/tests`，跨包同步测试放在 `packages/tests/sync`（`packages/tests` 是 workspace 包，只为把 `@goalloom/*` 链到该目录的 `node_modules`），加密构造测试放在 `packages/crypto/test`。桌面运行/构建工具放在 `apps/desktop/scripts`；仓库级脚本留在根目录 `scripts/`。官网保持独立安装，避免 Next.js 依赖进入 Electron 的扁平 `node_modules`。
