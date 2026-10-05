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

- `shared/contracts/update.ts`：`goalloom:update` 只接受 `status | check | install`；回复与推送同为 `{ version, state }`，`state.phase` 为 `unsupported | idle | checking | latest | downloading | ready | failed`。不跨桥传 URL、路径或发布说明。
- `main/update.ts`：`UpdateService` 包装 electron-updater（logger 关闭，`autoDownload`、`autoInstallOnAppQuit` 开启），事件映射为上述阶段并经 `goalloom:update-state` 推送；macOS 的库级下载事件只暂存版本，原生 `autoUpdater` 的 `update-downloaded` 才进入 `ready`，失败清除待就绪版本；`check(manual)` 在检查/下载/就绪时直接返回当前状态；只有手动检查把错误显示为 `failed`。`install()` 仅在 `ready` 时 `quitAndInstall(true, true)`（Windows 静默复用原安装目录后重启）。非打包环境为 `unsupported`，不触网。
- `main/window/menu.ts`：仅 macOS `Menu.setApplicationMenu`；`LanguagePreference.onChange` 触发重建。菜单点击经 `goalloom:open-about` 通知 renderer；窗口已关闭时先重建窗口。
- renderer：`state/update.ts` 单一 store（首次订阅时读取状态并监听推送，不轮询）；`App` 以 `{ section, at }` 请求打开设置，使菜单能重定向已打开的弹窗；`AboutPane` 无自有状态；图标为 `src/renderer/assets/app-icon.png`（`resources/icon.png` 的 256px 版本）。
- 打包：`electron-builder.yml` 的 `publish` 为 GitHub `thinkingjimmy/goalloom`，据此把 `app-update.yml` 写入包内并在 `release/` 生成 `latest-mac.yml` / `latest.yml`；macOS 额外产出 zip（Squirrel.Mac 更新载荷，需 Developer ID 签名，公证非必需）。脚本仍 `--publish never`，由人工上传。
- 发布一个可自动更新的版本：`package:mac` 与 `package:win` 后，把 `Goalloom-<v>-mac-arm64.dmg`、`Goalloom-<v>-mac-arm64.zip`、`Goalloom-<v>-mac-arm64.zip.blockmap`、`latest-mac.yml`、`Goalloom-<v>-win-x64.exe`、`Goalloom-<v>-win-x64.exe.blockmap`、`latest.yml` 一起上传到 tag `v<v>` 的正式（非 draft / prerelease）Release。缺少 yml 时客户端手动检查会显示失败。

## TODO

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

- [x] 设置 › 关于、真实版本与图标、macOS 菜单改道、五语言文案。
- [x] electron-updater + GitHub Releases、后台检查/下载、手动检查、重启更新、顶栏与导航红点。
- [x] 首个带更新器的版本 1.2.0 已发布（含 dmg / zip / blockmap / latest-mac.yml / exe / blockmap / latest.yml）；用户手动安装 1.2.0 一次后，之后的版本自动更新。
- [x] 1.3.0 正式发布，包含两平台安装包、完整自动更新资产与 SHA256SUMS；发布说明开头给出旧工作区的导出／导入升级步骤。
- [ ] Windows 11 真机：NSIS 静默更新与重启（负责人手动）。

## 验收

- `pnpm test:updates`（源码或 `node tests/desktop/updates.mjs <打包可执行文件>`）：菜单「关于 Goalloom」打开关于页、真实版本与图标加载、下载中/就绪/最新/失败文案、导航与顶栏红点及无障碍名称、菜单重定向已打开的设置、语言切换后菜单重建；报告与截图在 `output/tests/updates/`。
- `pnpm test:update-install`（可选，仅 macOS，需本机 Developer ID）：临时打出签名的 90.0.0 应用与 90.0.1 zip + `latest-mac.yml`，经 127.0.0.1 更新源从界面手动检查 → 下载 → 原生 Squirrel 就绪后「重启并更新」才出现 → 随即退出后原包被替换为 90.0.1 且签名有效；证据 `output/tests/updates/install.json`，失败保留 `install-failure.json`。重启按钮的自动重开不驱动，因为重开的进程会使用默认用户数据目录。
- [x] 2026-09-29 macOS 26 (Darwin 25.4.0) Apple Silicon 实机，Electron 44.4.4：`test:updates` 8 项、`test:update-install` 3 项通过（检查到就绪 0.8 s，退出到安装 1.7 s）。
