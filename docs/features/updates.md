# 关于与软件更新

> 设置 › 关于展示真实的应用图标与版本；正式包通过 GitHub Releases 自动检查、后台下载，重启完成更新。

## 产品规则

- 设置导航末尾新增「Goalloom › 关于」，与其他设置页同为居左布局：应用图标（裁去图标自带投影，只留细描边）、名称与版本小标签 `x.y.z`（悬停为「版本 x.y.z」，取自应用包版本，开发版同样显示 package.json 版本）、一句话定位；下方一行「软件更新」，左侧状态图标随阶段变化（最新为绿色对勾、检查／下载／就绪为蓝色、失败为红色警示），右侧为操作；底部为「官网 ↗」「更新日志 ↗」外链（系统浏览器打开）。
- 状态文案：空闲「新版本会在后台自动下载，重启后生效」→ 检查中（刷新图标旋转，减少动态效果时不转）→「已是最新版本 · HH:mm 检查」/「正在下载 x.y.z · N%」（按钮禁用）/「x.y.z 已下载，重启即可完成更新」（主按钮「重启并更新」）。手动检查失败显示「检查更新失败，请确认网络后重试」；后台检查失败静默，保持上一状态。开发版显示「开发版本不检查更新」，不提供按钮。
- 发现新版本（下载中或已就绪）时：顶栏设置图标右上角红点，无障碍名称变为「设置与数据（有新版本）」；设置导航「关于」旁显示红点 +「新版本」。已是最新后红点消失。
- 正式包启动 15 秒后首次检查，之后每 4 小时一次；自动下载；未点重启时，下次正常退出即安装。「重启并更新」沿用窗口的未保存草稿确认；取消退出则留到下次退出安装。
- macOS 应用菜单替换 Electron 默认菜单：「关于 Goalloom」打开设置 › 关于，「检查更新…」打开关于页并立即手动检查；已打开的设置弹窗会切到关于页（传输确认锁定导航时除外）。应用菜单项随语言切换重建；其余标准菜单（文件/编辑/显示/窗口）沿用系统角色。Windows 保留默认菜单，从设置进入关于页。
- 五种界面语言完整覆盖以上文案与菜单项。

## 工程契约

- `shared/contracts/update.ts`：`goalloom:update` 只接受 `status | check | install`；回复与推送同为 `{ version, state }`，`state.phase` 为 `unsupported | idle | checking | latest | downloading | ready | failed`。不跨桥传 URL、路径或发布说明。
- `main/update.ts`：`UpdateService` 包装 electron-updater（logger 关闭，`autoDownload`、`autoInstallOnAppQuit` 开启），事件映射为上述阶段并经 `goalloom:update-state` 推送；`check(manual)` 在检查/下载/就绪时直接返回当前状态；只有手动检查把错误显示为 `failed`。`install()` 仅在 `ready` 时 `quitAndInstall(true, true)`（Windows 静默复用原安装目录后重启）。非打包环境为 `unsupported`，不触网。
- `main/window/menu.ts`：仅 macOS `Menu.setApplicationMenu`；`LanguagePreference.onChange` 触发重建。菜单点击经 `goalloom:open-about` 通知 renderer；窗口已关闭时先重建窗口。
- renderer：`state/update.ts` 单一 store（首次订阅时读取状态并监听推送，不轮询）；`App` 以 `{ section, at }` 请求打开设置，使菜单能重定向已打开的弹窗；`AboutPane` 无自有状态；图标为 `src/renderer/assets/app-icon.png`（`resources/icon.png` 的 256px 版本）。
- 打包：`electron-builder.yml` 的 `publish` 为 GitHub `thinkingjimmy/goalloom`，据此把 `app-update.yml` 写入包内并在 `release/` 生成 `latest-mac.yml` / `latest.yml`；macOS 额外产出 zip（Squirrel.Mac 更新载荷，需 Developer ID 签名，公证非必需）。脚本仍 `--publish never`，由人工上传。
- 发布一个可自动更新的版本：`package:mac` 与 `package:win` 后，把 `Goalloom-<v>-mac-arm64.dmg`、`Goalloom-<v>-mac-arm64.zip`、`Goalloom-<v>-mac-arm64.zip.blockmap`、`latest-mac.yml`、`Goalloom-<v>-win-x64.exe`、`Goalloom-<v>-win-x64.exe.blockmap`、`latest.yml` 一起上传到 tag `v<v>` 的正式（非 draft / prerelease）Release。缺少 yml 时客户端手动检查会显示失败。

## TODO

- [x] 设置 › 关于、真实版本与图标、macOS 菜单改道、五语言文案。
- [x] electron-updater + GitHub Releases、后台检查/下载、手动检查、重启更新、顶栏与导航红点。
- [ ] 首个带更新器的版本（1.1.0 之后的下一版）需用户手动安装一次，此后才能自动更新。
- [ ] Windows 11 真机：NSIS 静默更新与重启（负责人手动）。

## 验收

- `pnpm test:updates`（源码或 `node tests/desktop/updates.mjs <打包可执行文件>`）：菜单「关于 Goalloom」打开关于页、真实版本与图标加载、下载中/就绪/最新/失败文案、导航与顶栏红点及无障碍名称、菜单重定向已打开的设置、语言切换后菜单重建；报告与截图在 `output/tests/updates/`。
- `pnpm test:update-install`（可选，仅 macOS，需本机 Developer ID）：临时打出签名的 90.0.0 应用与 90.0.1 zip + `latest-mac.yml`，经 127.0.0.1 更新源从界面手动检查 → 下载 → 「重启并更新」出现 → 退出后原包被替换为 90.0.1 且签名有效；证据 `output/tests/updates/install.json`。重启按钮的自动重开不驱动，因为重开的进程会使用默认用户数据目录。
- [x] 2026-09-29 macOS 26 (Darwin 25.4.0) Apple Silicon 实机，Electron 44.4.4：`test:updates` 8 项、`test:update-install` 3 项通过（检查到就绪 0.8 s，退出到安装 1.7 s）。
