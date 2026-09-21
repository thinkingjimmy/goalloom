# 资料来源与校验范围

文档v0.3 · 2026-09-21。产品交互与数据口径由本项目定义，已批准的方向见DECISIONS；下面的外部来源用于核对技术事实，不代表来源认可本产品或保证实现质量。

## S1

[Tauri — Architecture](https://v2.tauri.app/concept/architecture/)

用途：WebView + Rust + IPC 的桌面架构。

## S2

[Tauri — Frontend Configuration](https://v2.tauri.app/start/frontend/)  
[Tauri — Vite](https://v2.tauri.app/start/frontend/vite/)

用途：静态前端 / SPA 模型、Vite 推荐、不原生提供 SSR 运行服务。

## S3

[shadcn/ui — Vite installation](https://ui.shadcn.com/docs/installation/vite)  
[shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)

用途：Vite 接入、Tailwind 4 与 React 配置路线；实际版本仍需工程验证并锁定。

## S4

[Tauri — Distribute](https://v2.tauri.app/distribute/)

用途：构建、签名和平台安装包分发。

## S5

[Tauri — Windows Installer](https://v2.tauri.app/distribute/windows-installer/)

用途：MSI、NSIS 安装包及构建平台限制。

## S6

[Tailwind CSS — Compatibility](https://tailwindcss.com/docs/compatibility)

用途：Tailwind 4 所依赖的浏览器基础能力和版本。产品最低系统范围为建议值，不从 Tauri 的最低系统要求直接推导。

## S7

[Tauri — macOS Code Signing](https://tauri.app/distribute/sign/macos/)

用途：签名、公证、ad-hoc 与正式分发的差别。

## S8

[Tauri — Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)

用途：Windows 分发与代码签名方案。具体证书、信誉与安装体验须实测，不承诺仅签名即消除所有警告。

## S9

[Tauri — Capabilities](https://v2.tauri.app/security/capabilities/)

用途：按窗口与能力实施最小权限。

## S10

[Tauri — WebDriver](https://v2.tauri.app/develop/tests/webdriver/)

用途：当前 WebdriverIO Tauri service 的 embedded provider 路线和各平台差异；与直接使用 tauri-driver 区分。

## S11

[GitHub CLI — gh repo create](https://cli.github.com/manual/gh_repo_create)

用途：创建私人仓库、从本地 source 推送及 remote 参数。脚本真实远端执行尚未在本次对话中完成。

## S12

[SQLite — Online Backup API](https://www.sqlite.org/backup.html)

用途：活跃数据库一致性备份；不要将随意复制 WAL 模式主文件等同于完整备份。

## S13

[Towardo 名称的服装使用记录：批发商页面](https://www.vladimirmanda.de/kostenlos-naturlicher-mann-towar-s2928DE)

用途：仅记录原临时代号 Towardo 的历史名称检索，不是 Goalloom 的重名证据；本记录不作法律状态或商标权归属判断。

## S14

Spaceship `domain-bulk-check`，在本次对话中分两批查询共 40 个域名。完整结构化快照：[domain-check-2026-09-21.json](research/domain-check-2026-09-21.json)。

用途：购买前的可注册状态和工具返回 purchase 报价。查询时助手未购买或锁价，工具未返回续费价 / 期限 / 税费。用户随后已确认购买 `goalloom.com`，见 [品牌决定](NAMING.md)；原始查询快照保留不变。

## S15

[rusqlite — crate documentation](https://docs.rs/rusqlite/latest/rusqlite/)

用途：Rust 侧 SQLite 访问、事务与备份 API；不把文档访问时的最新版本视为本项目已验证版本。

## S16

[dnd-kit — official documentation](https://dndkit.com/)

用途：拖动、排序、跨列表与不同输入方式的技术路线；具体 major 与 React API 在 M1 验证。

## 用户提供的视觉资料

[参考图一：时间看板](references/01-time-board.png)  
[参考图二：目标关联](references/02-goal-links.png)

原始截图由用户在本次会话提供。只作为私人项目需求参考，不推断其中未说明的交互或隐藏功能，不把截图中的真实个人数据转成示例。


## 本轮新增核查

S17–S30 为 v0.2 新增来源。S1–S16 保留前轮记录，不表示每一页在本轮都重新验证。产品规格为我们的设计，不是框架官方承诺。

## S17

[QuickGUI — README（本轮 main 头提交固定链接）](https://github.com/egoist/quickgui/blob/811d6e2816d5229711f59683c4c9dfbb6fc74133/README.md)

用途：实验性警告、Go / TypeScript / Rust、Windows / Linux 编译与完善状态。

## S18

[QuickGUI — TypeScript implementation notes](https://github.com/egoist/quickgui/blob/811d6e2816d5229711f59683c4c9dfbb6fc74133/docs/typescript.md)  
[QuickGUI — Views](https://quickgui.dev/docs/typescript/rendering)  
[QuickGUI — Styling](https://quickgui.dev/docs/typescript/styling)

用途：Bun + Solid + Rust、无 DOM / WebView、FFI、className 不支持、style 对象；不能把 presets 当 Tailwind CSS。

## S19

[QuickGUI — Official site and benchmark methodology](https://quickgui.dev/)

用途：pre-alpha、原生功能、macOS / Windows 状态以及作者 benchmark 范围；不是本产品实测。

## S20

[QuickGUI — TypeScript getting started](https://quickgui.dev/docs/typescript)  
[QuickGUI — Architecture boundaries](https://github.com/egoist/quickgui/blob/811d6e2816d5229711f59683c4c9dfbb6fc74133/docs/architecture/boundaries.md)  
[QuickGUI — Updater platforms](https://quickgui.dev/docs/typescript/updater)

用途：TS 支持目标、非 macOS 原生验收边界；Windows 已存在打包 / 更新路径，不把尚未完整验收误报为没有代码。

## S21

[Electron — Introduction](https://www.electronjs.org/docs/latest/)

用途：Chromium + Node.js、HTML / CSS / JavaScript 跨平台桌面结构。

## S22

[Electron — Security](https://www.electronjs.org/docs/latest/tutorial/security)

用途：contextIsolation、sandbox、nodeIntegration、有限 IPC 与不可信内容边界。

## S23

[Electron — Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

用途：Electron ABI、原生模块重建与打包校验。

## S24

[electron-vite — Getting Started](https://electron-vite.org/guide/)

用途：main / preload / renderer 的 Vite 构建路线；非 Electron 官方自带工具，不将其视为已选定依赖。

## S25

[Tauri — WebView Versions](https://v2.tauri.app/reference/webview-versions/)

用途：WKWebView 与 WebView2、系统 WebView 版本差异。本文不将其历史兼容性列表作为 Goalloom 的最低 OS 承诺。

## S26

[Tauri — Window configuration / dragDropEnabled](https://v2.tauri.app/reference/config/#windowconfig)

用途：Windows HTML5 拖放与原生处理器冲突的特定配置，不等价于所有拖拽库有问题。

## S27

[Tauri — Prerequisites](https://v2.tauri.app/start/prerequisites/)

用途：Rust 与平台工具链。确切版本在 M1 重新锁定。

## S28

[Tauri — SQL plugin](https://v2.tauri.app/plugin/sql/)

用途：官方插件、JavaScript 数据库 API 与迁移。跨多步写入事务仍应按实际实现验证。

## S29

[Electron — Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)

用途：桌面分发签名；证书、公证或安装信誉不是换框架自动完成的工作。

## S30

[QuickGUI — reviewed main commit](https://github.com/egoist/quickgui/commit/811d6e2816d5229711f59683c4c9dfbb6fc74133)

用途：本轮仓库查询头提交，2026-09-20，提交说明 Release 0.1.6；不据此推断已稳定或已验证所有平台。


## v0.3 核查与用途

本轮用户批准Electron和历史 / 顺延方案。重新读取Electron的Context Isolation、Native Node Modules以及SQLite Backup API；S23、S12用于当前架构，S31为新增引用。Electron Security页面本轮直接读取超时，S22保留先前来源并以成功读取的S31补充隔离 / 有限API依据，不声称S1–S30全部重新核查。

产品默认策略、历史口径、事务字段、撤销抑制和测试用例是Goalloom的设计规格，不是引用某个竞品或框架官方提供这些业务功能。历史评估中的QuickGUI固定提交和域名原始快照保持不变。

## S31

[Electron — Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

用途：preload隔离、contextBridge、TypeScript接口与逐方法暴露，不能直接公开原始ipcRenderer。读取官方资料不等于已经完成实现或安全审计。
