# 关于与软件更新

> 设置 › 关于展示真实的应用图标与版本；正式包通过 GitHub Releases 自动检查、后台下载，重启完成更新。

## 产品规则

- 设置导航末尾新增「Goalloom › 关于」，与其他设置页同为居左布局：应用图标（裁去图标自带投影，只留细描边）、名称与版本小标签 `x.y.z`（悬停为「版本 x.y.z」，取自应用包版本，开发版同样显示 package.json 版本）、一句话定位；下方一行「软件更新」，左侧状态图标随阶段变化（最新为绿色对勾、检查／下载／就绪为蓝色、失败为红色警示），右侧为操作；底部为「官网 ↗」「更新日志 ↗」外链（系统浏览器打开）。
- 状态文案：空闲「新版本会在后台自动下载，重启后生效」→ 检查中（刷新图标旋转，减少动态效果时不转）→「已是最新版本 · HH:mm 检查」/「正在下载 x.y.z · N%」（按钮禁用）/「x.y.z 已下载，重启即可完成更新」（主按钮「重启并更新」）。手动检查失败显示「检查更新失败，请确认网络后重试」；后台检查失败静默，保持上一状态。开发版显示「开发版本不检查更新」，不提供按钮。
- 发现新版本（下载中或已就绪）时：顶栏设置图标右上角红点，无障碍名称变为「设置与数据（有新版本）」；设置导航「关于」旁显示红点 +「新版本」。已是最新后红点消失。
- 正式包启动 15 秒后首次检查，之后每 4 小时一次；自动下载；未点重启时，下次正常退出即安装。「重启并更新」沿用窗口关闭流程：先排空详情自动保存，新建草稿仍需确认；保存失败或取消退出则保留窗口，留到下次退出安装。
- macOS 必须在原生 Squirrel 下载、校验和准备完成后才显示「已下载」与重启按钮；仅 zip 下载完成时继续保持下载中，立即退出不能取消已宣布就绪的安装。
- macOS 应用菜单替换 Electron 默认菜单：「关于 Goalloom」打开设置 › 关于，「检查更新…」打开关于页并立即手动检查；已打开的设置弹窗会切到关于页（传输确认锁定导航时除外）。应用菜单项随语言切换重建；其余标准菜单（文件/编辑/显示/窗口）沿用系统角色。Windows 保留默认菜单，从设置进入关于页。
- 五种界面语言完整覆盖以上文案与菜单项。

## 工程契约

- macOS archive creation waits for the `afterSign` notarization hook to approve and staple the app. The bounded API-key flow and diagnostics are defined in the [hosted packaging guide](../development.md#托管打包与草稿-release); update ZIP hashes and blockmaps are generated after stapling.

- `shared/contracts/update.ts`：`goalloom:update` 只接受 `status | check | install`；回复与推送同为 `{ version, state }`，`state.phase` 为 `unsupported | idle | checking | latest | downloading | ready | failed`。不跨桥传 URL、路径或发布说明。
- `main/update.ts`：`UpdateService` 包装 electron-updater（logger 关闭，`autoDownload`、`autoInstallOnAppQuit` 开启），事件映射为上述阶段并经 `goalloom:update-state` 推送；macOS 的库级下载事件只暂存版本，原生 `autoUpdater` 的 `update-downloaded` 才进入 `ready`，失败清除待就绪版本；`check(manual)` 在检查/下载/就绪时直接返回当前状态；只有手动检查把错误显示为 `failed`。`install()` 仅在 `ready` 时 `quitAndInstall(true, true)`（Windows 静默复用原安装目录后重启）。非打包环境为 `unsupported`，不触网。
- `main/window/menu.ts`：仅 macOS `Menu.setApplicationMenu`；`LanguagePreference.onChange` 触发重建。菜单点击经 `goalloom:open-about` 通知 renderer；窗口已关闭时先重建窗口。
- renderer：`state/update.ts` 单一 store（首次订阅时读取状态并监听推送，不轮询）；`App` 以 `{ section, at }` 请求打开设置，使菜单能重定向已打开的弹窗；`AboutPane` 无自有状态；图标为 `apps/desktop/src/renderer/assets/app-icon.png`（`apps/desktop/resources/icon.png` 的 256px 版本）。
- 打包：`electron-builder.yml` 的 `publish` 为 GitHub `thinkingjimmy/goalloom`，据此把 `app-update.yml` 写入包内并在 `release/` 生成 `latest-mac.yml` / `latest.yml`；macOS 额外产出 zip（Squirrel.Mac 更新载荷，需要 Developer ID 签名）。托管 Release 工作流同时做 Hardened Runtime 签名和 Apple 公证；脚本仍 `--publish never`。资产由 [release.yml](../../.github/workflows/release.yml) 在手动运行并勾选 `update_draft` 时上传到草稿 Release，步骤与 secrets 见[开发文档](../development.md#托管打包与草稿-release)。不勾选时只保留 Actions artifact，不创建 Release；tag 推送不触发工作流。
- 发布一个可自动更新的版本：把 `Goalloom-<v>-mac-arm64.dmg`、`Goalloom-<v>-mac-arm64.zip`、`Goalloom-<v>-mac-arm64.zip.blockmap`、`latest-mac.yml`、`Goalloom-<v>-win-x64.exe`、`Goalloom-<v>-win-x64.exe.blockmap`、`latest.yml` 与 `SHA256SUMS.txt` 放到 tag `v<v>`。自动更新只认正式（非 draft / prerelease）Release，因此工作流只更新草稿，由负责人再发布该草稿。缺少 yml 时客户端手动检查会显示失败。

## TODO

### 1.9.7 update: inline subtasks and ordered task groups

Release preparation started on 2026-10-18. [The release notes](../releases/v1.9.7.md) cover Tab-based inline subtask creation, ordered group nesting, inline AI feedback and broader development-goal matching. Workspace format remains v11. Local `pnpm verify`, mapped supplemental feature coverage, performance and scaling passed without interrupted scenarios. The manual 100,000-task check was excluded. Frozen live Jev evaluation completed with 66/72 development, 61/64 holdout and 17/18 regression exact matches and no provider errors. Hosted signed packages and public download verification are pending.

### 1.9.6 update: task-level sync difference review

Released on 2026-10-18. [The release notes](../releases/v1.9.6.md) cover the selection-only task comparison, durable confirmations, and explicit recovery of rejected offline creations. All computers sharing a sync workspace must upgrade together because the encrypted operation format now includes causal metadata. Workspace format remains v11. Full local release coverage completed, including 100,000-task acceptance and two isolated replays after recorded native interruptions; performance and scaling passed. [The hosted release workflow](https://github.com/thinkingjimmy/goalloom/actions/runs/39085119940) passed both platform packages, signed macOS credential restart/replacement checks, notarization and packaged smokes. All eight public download files and both update manifests passed checksum verification. The five-language production website points to 1.9.6 and its live downloads passed verification. Windows 11 physical-machine acceptance remains separate.

### 1.9.5 update: persistent sync sessions

Released on 2026-10-17. [The release notes](../releases/v1.9.5.md) cover automatic session restoration, noninteractive macOS credential storage, password recovery, and preserved task identities/deletions. Workspace format remains v11. Full local release coverage completed after correcting two test fixtures; performance and scaling checks passed. Both hosted platform packages and all eight download files passed verification. macOS provisioning, signing, notarization, and the signed session restart/replacement gate passed. Windows 11 and second physical Mac acceptance remain separate. The five-language production website points to 1.9.5 and its downloads were checked online.

### 1.9.4 更新说明：同步与恢复更安全

已于 2026-10-17 发布。完整中英文说明见 [v1.9.4 发布说明](../releases/v1.9.4.md)。包含保留／清除本地任务的退出选择、账号切换隔离、保留旧云端空间的安全恢复、固定工作区重启和网络恢复后自动补传。工作区格式保持 v11；配套 `0009_sync_security.sql` 已部署，27 项真实数据库检查和 8 项真实云端客户端场景通过。

### 1.9.3 更新说明：先记下来，随后整理

已于 2026-10-16 发布。完整中英文说明见 [v1.9.3 发布说明](../releases/v1.9.3.md)。包含 Enter 立即保存、Jev 1.14 自动补全、空闲同步减请求与统一控件；工作区升至 v11，升级前创建并校验保护备份。非交互钥匙串策略保持不变。两平台 8 个发布文件已核验，macOS 签名、公证、装订和正式签名凭据恢复验证通过；配套同步后端与快照函数已部署。

### 1.9.2 更新说明：不再弹出钥匙串密码框

已于 2026-10-16 发布。完整中英文说明见 [v1.9.2 发布说明](../releases/v1.9.2.md)。首次使用、启动、开启同步或 AI，以及恢复已有凭据均使用非交互钥匙串访问；无法读取的凭据保留加密内容，本地看板继续可用。两平台 8 个发布文件已核验；macOS 应用与 DMG 的签名、公证及装订验证通过，正式签名包的首次加密、重启恢复及 1.9.1 升级恢复验证通过。

### 1.9.1 更新说明：同步修复与按需访问钥匙串

已于 2026-10-16 发布。完整中英文说明见 [v1.9.1 发布说明](../releases/v1.9.1.md)。重复关联重放修复与同步凭据按需访问优化均已包含；两平台 8 个发布文件已核验，macOS 应用与 DMG 已通过签名、公证及装订验证。

### 1.9.0 更新说明：任务留在原位，设置跟随你

已于 2026-10-15 发布。完整中英文说明见 [v1.9.0 发布说明](../releases/v1.9.0.md)。两平台的 8 个发布文件已完成校验；macOS 应用与 DMG 均通过签名、公证及装订验证。公开版 macOS 1.8.0 使用 ad-hoc 签名，需退出应用后手动安装 1.9.0 一次，工作区与设置保留。

### 1.8.0 更新说明：可选的桌面同步

已于 2026-10-13 发布。完整中英文说明见 [v1.8.0 发布说明](../releases/v1.8.0.md)。

### 1.7.0 更新说明：看板上的二级任务

已于 2026-10-13 发布。完整中英文说明见 [v1.7.0 发布说明](../releases/v1.7.0.md)。

### 1.6.0 更新说明：从卡住的任务继续行动

- 任务详情新增“我卡住了”：选择障碍或填写具体问题，明确生成后才向已启用的 AI 服务发送上下文。打开帮助不触网。
- 辅助结果改写并自动保存当前 Markdown 说明，保留已完成清单和已有链接；“重新想想”使用最新说明继续生成。编辑器保持可用，生成期间的新编辑会使旧结果失效。
- 一次工作区撤销可还原改写前的说明；后续标题或期限修改保留，后续说明编辑产生明确冲突。失败、取消、不完整上下文或无效输出保持原说明。
- 详情采用单面板，取消、归档、删除与关闭并列；移除活动侧栏和重复保存步骤。顺延提示使用权威执行事实，未知或部分数据不补零、不显示为精确计数。
- 五语言覆盖帮助入口、障碍选择、重新生成、错误和升级说明；修复取消或重叠预检产生的迟到回复与虚假错误。
- 工作区格式升至 v8。旧库启动时先创建并校验保护副本，再经第二次明确确认后替换；取消保持原库，升级保留任务、历史、外观和日历配置，并暂停恢复后的自动顺延。升级前仍建议保留 JSON 导出；完整契约见 [任务辅助规格](Goalloom-Smart-Assistance-PRD-TODO-v1.1.md#owner-update--2026-10-07-rewrite-notes)。
- 真实模型语义质量、物理 IME 和 Windows 11 实机验收单独记录；合成响应测试不代表真实模型质量通过。

### 1.5.0 更新说明：在看板上编辑，更清楚地回顾

- 双击当期、未来、Later 或已完成任务的标题，可在看板上直接编辑。Enter 只保存标题；Escape 或空白提交恢复原文。单击仍打开详情。
- 列内新建支持长标题自动折行，输入框随内容和列宽增高或收缩。流程圆点保持首行位置，流程信息放在标题下方；粘贴换行仍作为一条任务处理。
- 详情属性行使用流程芯片，集中提供上级关联与流程颜色操作。活动记录增加只读洞察和月历，展示顺延次数、停留时间与完成后重新打开的记录；撤销及其原操作不计入洞察。
- 空列起草按钮按半年、3个月、月、周、日显示具体动作；五语言长文案保持两个按钮同排、等高。移除复盘完成后的重复提示，保留复盘状态和当期安排入口。
- 非本期列使用日期旁的返回图标，列头保持单行。悬停或键盘聚焦可查看完整提示，Esc 只关闭提示，触控区域保留 44px。
- 定向起草打开时显示其目标列，避免任务创建到隐藏列后无法看到。
- 链接预览支持 TUN 网络的主机名 fake-IP 响应，继续核验地址绑定并拒绝不安全的私网地址；改善说明编辑的内距与五语言文案。
- 工作区格式保持 v7。1.4 用户直接升级；1.3 及更早版本仍需先备份、导出，再按 [日历模式升级步骤](calendar-modes.md#63-存储不做原地迁移d10srcmainstorage) 导入。

### 1.4.0 更新说明：按自己的节奏规划与复盘

- 顶栏可独立选择显示哪些时间列，至少保留一列；隐藏不会改变任务、关联、草稿、滚动或浏览周期，偏好只保存在本机。
- 设置 › 日历与顺延支持六个时间尺度分别选择自动或手动顺延；新工作区仅今天默认自动，其余默认手动。日历边界与模式更清晰，修改日历经安全重置重新配置。
- 工作区格式升至 v7：1.3.0 及更早版本必须先备份、导出，再完成新版空工作区配置并导入；新版不会原地修改旧库。导入保留原模式、起点、条目、关联、历史和原有策略，补全年／半年手动策略；完整步骤见 [日历模式 §6.3](calendar-modes.md#63-存储不做原地迁移d10srcmainstorage)。
- 周／月复盘保留编辑与选择，支持跳过规划；最后一步确认后直接返回看板，按动效偏好播放一次完成反馈，并可继续安排当期任务。
- 优化关联候选、拖拽与连线；移动到 Later 会在同一操作中解除上级关联，撤销恢复原关联。
- 改善列内新建、详情保存／空标题处理与焦点返回、说明编辑、菜单定位、主题切换和五语言文案。
- 修复 macOS 更新过早显示就绪的问题，原生准备完成后再提示重启，保证随即退出可完成安装。

### 1.3.0 更新说明：年 / 半年与双日历模式

- 新工作区可选择「365 天」或「自然年」，方向放进年列；模式和起点在明确确认后锁定，设置中可查看，暂不支持修改。
- 新增年、半年列。六个时间列固定显示，窄窗口在时间区横向滚动；Later 仍可收起。年 / 半年只手动处理，不会自动顺延。
- 旧工作区需先用旧版导出 JSON，退出旧版，再安装新版并导入；完整步骤见 [日历模式 §6.3](calendar-modes.md#63-存储不做原地迁移d10srcmainstorage)。导入保留原起点、条目、历史与回执，并默认 365 天；确认按设置处理后才恢复自动顺延。新版会只读拒绝直接打开 v1–v5，v6 工作区也不能交给旧版打开。
- Composer 的列菜单键位改为 1–7，依次为今天、本周、本月、3个月、半年、年、Later。
- 月复盘将回顾、处理未完成和安排目标周期合并为连续步骤；复盘总览覆盖六个时间列。
- 支持从流程圆点拖出关联线，连接更长周期的上级；流程合并与关联可原子撤销。
- TypeSafe 原生渠道已下线；Jev 与洞察继续通过 OpenRouter 或 Vercel AI Gateway 使用。

### 软件更新功能

- [x] 1.9.6 is public with task-level sync difference review, durable confirmations, both installers, complete auto-update assets and verified checksums.

- [x] 1.9.5 is public with both installers, complete auto-update assets and SHA256SUMS. Signed macOS restart/replacement checks and Case 1 / relogin / deletion regression coverage passed.
- [x] 1.9.4 正式发布，本机发布验证覆盖已补齐，两平台打包、macOS 签名与公证和 8 个发布文件核验通过。官网五语言下载已更新并完成线上核对，见 [官网规格](website.md)。
- [x] 设置 › 关于、真实版本与图标、macOS 菜单改道、五语言文案。
- [x] electron-updater + GitHub Releases、后台检查/下载、手动检查、重启更新、顶栏与导航红点。
- [x] 首个带更新器的版本 1.2.0 已发布（含 dmg / zip / blockmap / latest-mac.yml / exe / blockmap / latest.yml）；用户手动安装 1.2.0 一次后，之后的版本自动更新。
- [x] 1.3.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；发布说明开头给出旧工作区的导出／导入升级步骤。
- [x] 1.4.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；发布说明开头给出 v7 工作区的导出／导入升级步骤。
- [x] 1.5.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；1.4 工作区可直接升级，旧格式升级步骤保留在发布说明中。
- [x] 1.9.3 正式发布，包含即时录入与自动补全、同步请求优化、统一控件、v11 保护升级、配套后端、两平台安装包、完整自动更新文件与 SHA256SUMS。
- [x] 1.9.2 正式发布，包含非交互钥匙串访问、开发凭据隔离、两平台安装包、完整自动更新文件与 SHA256SUMS；本地 `pnpm verify` 全量验证、macOS 正式签名凭据恢复与安装包验证通过。
- [x] 1.9.1 正式发布，包含同步重放修复、按需访问同步钥匙串、两平台安装包、完整自动更新文件与 SHA256SUMS；macOS 签名、公证与装订验证通过。
- [x] 1.9.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；macOS 应用与 DMG 均通过签名、公证及装订验证。发布说明注明公开版 macOS 1.8.0 的一次手动升级要求。
- [x] 1.8.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS。可选同步：用 Google 登录后看板在电脑之间保持同步，数据在离开设备前加密，设置时请用户设置同步密码。构建期配置见[开发文档](../development.md)。
- [x] 1.7.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；1.6.0 工作区在自动保护备份后原地升级到 schema v10。本版本没有账号或云同步。
- [x] 1.6.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；真实 macOS 1.5.0→1.6.0 保护升级、原副本保留与重启验收通过，Windows 11 仍由负责人手动验收。
- [ ] Windows 11 真机：NSIS 静默更新与重启（负责人手动）。

## 验收

- `pnpm test:updates`（源码或 `pnpm --filter @goalloom/desktop exec -- node tests/updates.mjs <打包可执行文件>`）：菜单「关于 Goalloom」打开关于页、真实版本与图标加载、下载中/就绪/最新/失败文案、导航与顶栏红点及无障碍名称、菜单重定向已打开的设置、语言切换后菜单重建；报告与截图在 `output/tests/updates/`。
- `pnpm test:update-install`（可选，仅 macOS，需本机 Developer ID）：临时打出签名的 90.0.0 应用与 90.0.1 zip + `latest-mac.yml`，经 127.0.0.1 更新源从界面手动检查 → 下载 → 原生 Squirrel 就绪后「重启并更新」才出现 → 随即退出后原包被替换为 90.0.1 且签名有效；证据 `output/tests/updates/install.json`，失败保留 `install-failure.json`。重启按钮的自动重开不驱动，因为重开的进程会使用默认用户数据目录。
- [x] 2026-09-29 macOS 26 (Darwin 25.4.0) Apple Silicon 实机，Electron 44.4.4：`test:updates` 8 项、`test:update-install` 3 项通过（检查到就绪 0.8 s，退出到安装 1.7 s）。
