<p align="center">
  <img src="../apps/desktop/resources/icon.png" alt="Goalloom 图标" width="112">
</p>

<h1 align="center">Goalloom</h1>

<p align="center"><strong>把三个月的方向，连接到今天的行动。</strong></p>

<p align="center">
  Goalloom 是一款以 OKR 理念驱动、开源、本地优先的 Todo 应用，支持 macOS 与 Windows。<br>
  时间列回答「什么时候做」，关联回答「为什么做」——重要但不紧急的目标，不再被每天的急事淹没。
</p>

<p align="center">
  <a href="https://github.com/thinkingjimmy/goalloom/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/thinkingjimmy/goalloom?display_name=tag&amp;sort=semver"></a>
  <a href="https://github.com/thinkingjimmy/goalloom/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/thinkingjimmy/goalloom?style=flat&amp;logo=github"></a>
  <a href="../LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="https://www.goalloom.com/zh-CN/">官网</a> ·
  <a href="https://github.com/thinkingjimmy/goalloom/releases/latest">下载</a> ·
  <a href="./development.md">开发文档</a> ·
  <a href="./features/">功能规格</a> ·
  <a href="https://x.com/thinkingjimmy">X</a>
</p>

<p align="center">
  <a href="../README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <img src="./images/readme.zh-CN.jpg" alt="Goalloom 目标看板：3个月、本月、本周与今天">
</p>

# 核心功能

- **目标和今天，在同一块看板上。** 四个时间列——3个月、本月、本周、今天——让季度目标就摆在今天要做的事旁边；可收起的 Later 侧栏暂存尚未安排的想法。
- **两级任务，独立安排。** 把任务拖到另一项上，或在列内新建／看板标题编辑时按 Tab，即可缩进；Shift+Tab 恢复一级。子任务继承目标与颜色，保留自己的说明和状态，并可独立安排到其他列或周期。移动父任务时，只带走排在同一位置的子任务。
- **每件事都知道自己为了什么。** 把事项挂在更长周期的目标下。筛选一个目标（⌘1–⌘9），关系线会把它的整条链路连起来；悬停任意一行，就能看到它的上下游。关联只解释「为什么」，不汇总进度。
- **随手记下，Jev 帮你归位。** 可选的智能输入会参考你的目标和历史 Todo，把新事项放进合适的时间列，并推荐它属于哪个目标。创建前可预览、可修改，整批一步撤销。可选择 macOS Plus 内置 AI，或使用你自己的密钥（BYOK）。
- **没有事会悄悄溜走。** 到期未完成的事项自动顺延到下一个周期，往期记录随时可读，也能批量处理。
- **每一步都能撤销，数据不会丢。** 每次改动都能单独撤销，不影响你之后的编辑；每日自动备份，恢复或重置前先留保护副本。
- **本地优先，保护隐私。** 工作区是你电脑上的 SQLite 数据库，没有内容遥测。macOS 可选的 Plus 同步会在数据离开设备前加密。
- **为键盘而生，支持五种语言。** ⌘N 新建、⌘K 搜索、⌘Z 撤销。界面支持中文、英文、日文、西班牙文和法文；纸感、简约或 macOS 27 风格，浅色或深色。

# 开始使用

## 下载

[下载最新版本 →](https://github.com/thinkingjimmy/goalloom/releases/latest)

| 平台 | 版本 | 安装包 |
| --- | --- | --- |
| macOS 14+（Apple 芯片） | 1.10.0 | [Goalloom-1.10.0-mac-arm64.dmg](https://github.com/thinkingjimmy/goalloom/releases/download/v1.10.0/Goalloom-1.10.0-mac-arm64.dmg) |
| Windows 11（x64） | 1.9.10 | [Goalloom-1.9.10-win-x64.exe](https://github.com/thinkingjimmy/goalloom/releases/download/v1.9.10/Goalloom-1.9.10-win-x64.exe) |

两个平台的本地功能和 BYOK 继续免费。macOS 1.10.0 提供 Plus 加密同步与内置 AI，每月 USD 8.99 或每年 USD 79。八天试用需主动领取，每个账号仅限一次，无需绑卡，也不会自动转为付费订阅。Windows 保持 1.9.10，可使用本地功能和 BYOK；本次未为 Windows 开放 Plus。iPhone 应用尚未公开发布。

## 首次打开

macOS 安装包已通过 Developer ID 签名和 Apple 公证。Windows 版仍未签名。

**macOS。** 打开 DMG，把 Goalloom 拖进「应用程序」后打开即可。

**从公开版 macOS 1.8.0 升级：** 退出 Goalloom，用 1.10.0 替换「应用程序」中的旧版一次。旧版的 ad-hoc 签名无法通过内置更新切换到本次 Developer ID 签名。升级前请保留本地备份。

**Windows。** 出现 SmartScreen「Windows 已保护你的电脑」时，点「更多信息 → 仍要运行」，再按安装向导完成。

工作区位于 `~/Library/Application Support/Goalloom/`（macOS）或 `%APPDATA%\Goalloom\`（Windows），每日备份在其中的 `backups/`。覆盖安装新版本会保留原有数据。

## 从源码构建

需要 Node.js 22.12 及以上与 pnpm 11.9（已在 `package.json` 中锁定，可由 Corepack 启用）。

```bash
git clone https://github.com/thinkingjimmy/goalloom.git
cd goalloom
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打本地安装包：

```bash
pnpm package:mac   # apps/desktop/release/Goalloom-<版本>-mac-arm64.dmg
pnpm package:win   # apps/desktop/release/Goalloom-<版本>-win-x64.exe
```

已发布的 macOS 1.10.0 使用 v14 工作区格式，Windows 1.9.10 使用 v11。macOS 升级 v11 工作区前会创建并验证保护性本地备份。请保留该备份：1.9.10 无法打开 v14 工作区。使用 Plus 时请使用同一账号和同步密码。部分旧云工作区无法自动恢复，重新登录不会修复这些副本；请保留原本地数据和备份。说明见 [v1.10.0 发布说明](./releases/v1.10.0.md)，配置见[开发文档](./development.md)。

完整测试、打包检查、代码地图以及贡献者与开发代理的约定见[开发文档](./development.md)。官网代码在 [`apps/website/`](../apps/website/README.md)。

已发布的 macOS 1.10.0 支持使用 Apple／Google 登录，无需同时开启同步。[内置 AI](./features/hosted-ai.md)需要明确授权、有效试用或付费资格，并受服务端成本保护。源码中的 iOS 登录适配器不代表 iPhone 应用已公开发布；开发配置与验收范围见[移动端指南](../apps/mobile/README.md#native-account-configuration)。

# 协作

问题、反馈和建议请提交到 [GitHub Issues](https://github.com/thinkingjimmy/goalloom/issues)。

# 许可证

桌面端、移动端和共享包使用 [MIT 许可证](../LICENSE)。服务端同步代码使用 [GNU AGPL-3.0-only](../supabase/LICENSE)。

| 路径 | 许可证 |
|---|---|
| [`LICENSE`](../LICENSE)、`apps/desktop/`（应用、测试与桌面脚本）、`apps/mobile`、`packages/`（含 `packages/crypto/test` 与 `packages/tests`）、`scripts/`、`apps/website/`、`docs/` | MIT |
| [`supabase/`](../supabase/)（迁移、RPC、Edge Functions、pgTAP、`reset.sql`、`config.toml`，以及 [`supabase/LICENSE`](../supabase/LICENSE)） | AGPL-3.0-only |

`@goalloom/contracts`、`@goalloom/crypto`、`@goalloom/schema`、`@goalloom/store-core` 和 `@goalloom/sync` 只依赖彼此及其已固定的库，源码仍属仓库 MIT 许可证。`scripts/supabase-remote.mjs` 与 `scripts/pg-sync-test.mjs` 是 MIT 测试客户端。
