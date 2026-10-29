# Goalloom 仓库迁移计划与公开文件白名单

> 状态：方案已选定，迁移未执行。日期：2026-10-27，Asia/Singapore。父级：[开发文档](development.md)。
>
> INPUT: Current source and release configuration, existing public repository identity, and the owner's repository and cost requirements.
> OUTPUT: A migration sequence, public path policy, configuration ownership, acceptance criteria, and rollback rules.
> POS: Internal engineering plan. After cutover, maintain this file only in the private development repository.
>
> [PROTOCOL]: Update this header when making changes, then check README.md.

保留 `thinkingjimmy/goalloom` 的公开身份、Releases 和桌面打包能力。新建私有 `thinkingjimmy/Goalloom-Dev`，承接完整源码与开发历史。以后只在私有仓开发，由工具导出可独立构建的公开客户端。后端、计费服务、部署工具和内部测试留在私有仓。

当前只编写计划。创建仓库、推送代码、修改工作流或连接、运行打包、发布资产，以及更改授权，均属于后续执行阶段。

## 目标与固定边界

- 客户端继续使用 MIT，公开完整的密钥处理、加密、网络传输和解密调用路径。客户端的订阅界面、资格请求、AI 客户端和本地业务逻辑也公开。
- 同步后端、计费后端、托管 AI 服务及运营实现停止随后续客户端版本公开。
- 桌面构建、签名、公证和候选资产上传继续在现有公开仓执行。所有 Actions 保持手动触发，使用标准 runner，不新增付费 runner 或私有仓托管构建。
- 公开构建只检出公开提交；不下载私有源码、测试包或部署凭据，也不使用跨仓工作流来运行私有测试。
- 保留现有应用身份、签名身份、Keychain access group、用户数据目录、OAuth 回调、生产服务和更新渠道。本次仓库调整不要求用户重新登录、迁移数据或重建同步密钥。
- 保留公开仓已有提交、分支、tag 和已发布资产。正常追加切换提交，不强推、不清理历史、不重指向旧 tag。
- 已公开的 MIT／AGPL 代码仍可按原许可使用。此方案保护后续开发，不承诺收回旧副本，也不能阻止他人独立实现兼容后端。
- 移入私有仓不等于完成后端重新授权。保留现有版权与许可文本；未来如需更改后端授权，先核对贡献者、依赖和分发义务，另行处理。

## 当前依赖与迁移难度

盘点基于本地提交 `798390b1101a1d647fdb338ba61db76867f9124e` 的生产构建配置，并只读核对了公开 `main`，当时为 `3e568c0e453d4865c3ad72cffb6eb7f1254c3b60`。两者已分叉，工作区还有未提交改动。因此这些提交是盘点记录，不是最终迁移基线。执行前必须重新读取双方最新状态，并保全各分支与工作区。

| 范围 | 当前依赖 | 工作量与处理 |
| --- | --- | --- |
| 下载与自动更新 | [electron-builder.yml](../apps/desktop/electron-builder.yml) 和 [官网版本快照](../apps/website/lib/release.ts) 指向现有公开仓 | 低。仓库名称、Release URL 和已发布文件保持原样 |
| 签名与公证 | [release.yml](../.github/workflows/release.yml) 使用 `release` 环境和 Apple 凭据 | 低至中。保留现有配置，执行前核对实际作用域与访问规则 |
| 发布工作流 | 同一文件包含源码测试、原生测试、构建、签名、打包和草稿上传 | 中。分离私有验证与公开打包，不能原样复制 |
| 公开独立构建 | 根配置引用测试 workspace、测试目录和测试依赖 | 中。生成公开专用 manifests、TypeScript 配置和锁文件 |
| 源码导出与审计 | 尚无 Goalloom 专用生产源码导出入口 | 中。新增确定性导出、独立审计、私有映射与失败报告 |
| 官网部署 | [官网 README](../apps/website/README.md) 规定 Vercel Root Directory 为 `apps/website` | 中。核对实际 Git 连接和权限；若连接当前仓，切至私有仓并验证一次 |
| 云端运行 | [部署工具](../scripts/deploy/README.md)、[计费工具](../scripts/billing/README.md)、[生命周期工具](../scripts/lifecycle/README.md) 位于当前源码树 | 低。工具转入私有仓；线上项目、配置和服务无需随仓库重建 |

配置作用域以执行前的实际回读为准。此次未读取 GitHub secret 值、Vercel 控制台配置或生产凭据。

## 仓库与配置归属

| 内容 | 私有 Goalloom-Dev | 现有公开 goalloom |
| --- | --- | --- |
| 完整开发历史、所有待合并分支 | 保存并继续开发 | 保留切换前历史，切换后只接收客户端导出提交 |
| 桌面与共享源码 | 唯一编辑源 | 按白名单发布生产客户端 |
| `supabase/` 与后端许可 | 保存完整内容 | 切换后的当前树移除；旧历史仍保留 |
| `scripts/` 下的部署、计费、生命周期和评估 | 保存并运行 | 后续提交不导出 |
| `apps/website/` | 开发与部署源 | 后续提交不导出 |
| `apps/mobile/`、`packages/local-store/` | 保留开发，不改变移动端交付范围 | 首次白名单不包含；公开移动端需另行扩展 |
| 内部业务测试、fixtures、截图、验收记录 | 本机或受控私有环境运行与保存 | 后续提交不导出；下述最小合成签名验收是明确例外，旧 Actions 证据不因本计划删除 |
| 桌面打包配置与脚本 | 维护源文件并验证 | 导出后执行，构建公开提交 |
| Apple 签名与公证材料 | 不复制到 Git；安装包验收不复制公开 runner 的签名凭据 | 继续使用现有 secret／environment 注入，签名验收使用临时 keychain |
| 公开生产客户端配置 | 保留现有受控来源 | 沿用现有构建注入；只允许客户端可发布配置 |
| `.env.*.local`、`.vercel/`、本机工具登录态 | 保持忽略；按需要安全关联新工作目录 | 不进入新提交或构建资产 |
| 私有验证与公开提交的对应记录 | 保存私有 SHA、公开 SHA、导出规则与文件摘要、验收报告和资产摘要 | 只公开公开 SHA、工具版本、文件校验和及合适的构建记录 |

现有工作流引用的名称为 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY_P8`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`、`APPLE_TEAM_ID`、`GOALLOOM_MAC_PROVISIONING_PROFILE_B64` 和 `GOALLOOM_PRODUCTION_SUPABASE_ANON_KEY`。记录名称和作用域，不读取、导出或打印值。`GITHUB_TOKEN` 继续使用工作流临时令牌；不新增访问私有仓的 token。

Supabase URL 和 anon 客户端凭据会进入客户端，不能视为服务端秘密。它们仍遵守现有生产项目匹配与注入规则。Service-role、数据库、支付、部署和供应商管理凭据只留在私有运营环境。仓库迁移本身不要求轮换这些凭据。

## 公开文件白名单

本节是拟实现的公开路径政策。默认拒绝，只有下列路径与规则可进入切换后的公开提交。`**` 表示递归范围，不表示该范围内任何新文件都自动获准：每次导出须生成逐文件清单及 SHA256，并检查内容、依赖和权限。全局拒绝规则优先，只有明确列出的精确例外可以覆盖它。

### 根目录与构建入口

| 路径 | 导出方式与边界 |
| --- | --- |
| `LICENSE` | 保留现有 MIT 原文与版权声明 |
| `README.md` | 生成公开版，保留产品、下载、构建和隐私入口；去掉私有文档链接和后端部署介绍 |
| `.editorconfig`、`.gitattributes` | 保留构建所需的文本与换行规则 |
| `.gitignore` | 生成公开版，继续忽略依赖、产物、凭据、用户数据和本地报告 |
| `package.json` | 生成公开版，仅保留开发、类型检查、生产构建和打包入口；保留必要安装脚本和版本约束 |
| `pnpm-workspace.yaml` | 显式列出 `apps/desktop` 与下述五个共享包；不用 `packages/*` 接纳未知包；保留构建权限与安装布局 |
| `pnpm-lock.yaml` | 根据公开 workspace 生成，固定保留依赖的解析版本与 integrity；拒绝无关升级或私有包残留 |
| `tsconfig.json` | 生成公开版，覆盖客户端、共享包及 Vite 所需输入，移除内部测试和 Vitest 配置引用 |
| `apps/desktop/package.json` | 生成公开版，保留生产依赖、必要构建依赖和构建／打包 scripts；删除指向私有文件的 scripts |
| `apps/desktop/electron.vite.config.ts` | 保留完整生产组合与凭据平台边界；不依赖私有目录 |
| `apps/desktop/electron-builder.yml` | 保留现有应用身份、平台目标、签名 hooks、资源与 `thinkingjimmy/goalloom` 发布目标 |

### 客户端与共享源码

| 路径 | 导出方式与边界 |
| --- | --- |
| `apps/desktop/src/**` | 保留生产源码、HTML、样式、离线资源和第三方许可；排除内部 README、测试与开发文件。首次清单必须枚举实际文件 |
| `apps/desktop/src/renderer/components/ui/LICENSE` | 精确保留；许可证汇总器直接读取它 |
| `apps/desktop/native/keychain-policy.c` | 保留原生 Keychain 策略源码 |
| `apps/desktop/native/session-key.m` | 保留会话凭据原生实现 |
| `apps/desktop/resources/icon.png` | 当前生产图标。以后新增资源逐项审查，不开放整个资源目录 |
| `apps/desktop/build/entitlements.mac.plist` | 保留普通 macOS 权限声明 |
| `apps/desktop/build/entitlements.mac.inherit.plist` | 保留子进程权限声明 |
| `apps/desktop/build/entitlements.mac.session.plist` | 保留正式会话 Keychain 权限声明 |
| `packages/contracts/src/**`、`packages/contracts/package.json` | 协议与数据契约；manifest 按公开依赖生成 |
| `packages/crypto/src/**`、`packages/crypto/package.json` | 密钥、加解密、签名与恢复实现；保留原有生产代码 |
| `packages/schema/src/**`、`packages/schema/package.json` | 本地 schema 与升级依赖，不能误作服务端迁移删除 |
| `packages/store-core/src/**`、`packages/store-core/package.json` | 本地存储、投影与同步应用逻辑 |
| `packages/sync/src/**`、`packages/sync/package.json` | 完整客户端同步、传输、取回与密文处理；不包含 `supabase/` 服务端实现 |
| `packages/crypto/test/vectors.json` | 唯一测试目录例外。`crypto/src/parity.ts` 直接导入它；保留合成向量供独立构建与核对，不开放整个测试目录 |

`sync/src/index.ts` 当前还导出 `memory-remote.ts` 和 `prototype.ts` 的合成工具；首次迁移保留这些源码与导出，避免为整理仓库改变共享 API。它们不等于真实同步后端，不因名称含 memory、prototype 或 mock 就机械删除。`@js-temporal/polyfill` 虽不进入运行产物，其类型被 `domain/temporal.ts` 使用，须保留构建依赖。

首次导出不重写生产逻辑，不删除隐私相关调用，也不通过把源码移到私有下载步骤来补依赖。可剥离内部 `[PROTOCOL]` 流程行；保留依赖、职责、解释意图的注释和所有版权声明，并记录确定性的注释转换。

### 桌面构建脚本

以下文件按原路径保留，不允许整个 `apps/desktop/scripts/` 目录：

| 路径 | 用途 |
| --- | --- |
| `apps/desktop/scripts/build/production.mjs` | 生产构建与 prepared manifest |
| `apps/desktop/scripts/build/prepared-build.mjs` | 提交、版本、平台、配置及文件哈希校验 |
| `apps/desktop/scripts/build/sync-define.ts` | 生产客户端配置校验与内嵌 |
| `apps/desktop/scripts/build/keychain-policy.ts` | 原生凭据模块编译 |
| `apps/desktop/scripts/build/third-party-notices.mjs` | 第三方许可证汇总 |
| `apps/desktop/scripts/build/check-production.mjs` | 正式产物检查 |
| `apps/desktop/scripts/build/package-report.mjs` | 安装包身份、组成、体积与摘要检查 |
| `apps/desktop/scripts/build/package-budgets.json` | 现有安装包组成与体积基线，不新增性能测试 |
| `apps/desktop/scripts/build/package-locales.json` | 正式运行时语言清单 |
| `apps/desktop/scripts/build/apple-tools.mjs` | 有界 Apple 工具执行与脱敏 |
| `apps/desktop/scripts/build/notarize.mjs` | 应用与 DMG 公证及票据验证 |
| `apps/desktop/scripts/build/session-profile.mjs` | 正式 provisioning profile 校验与嵌入 |

### 公开工作流与辅助脚本

| 路径 | 导出方式与边界 |
| --- | --- |
| `.github/workflows/release.yml` | 改造为手动、公开源码构建与打包。保留签名、公证、平台 manifest 和候选资产门禁；移除私有测试调用及其报告上传 |
| `.github/scripts/macos-signing.sh` | 保留凭据准备、签名、公证验证与 always cleanup |
| `.github/scripts/macos-profile.mjs` | 保留 profile 读取与校验；迁移验证不启用创建 |
| `.github/scripts/apple-profile.mjs` | 保留匹配已有证书与 profile 的辅助实现 |
| `.github/scripts/draft-release.sh` | 保留按公开提交创建草稿与上传的能力；先完成按实际平台选择的改造 |
| `.github/scripts/acceptance/keychain-signed.mjs` | 拟新增。从当前签名验收提炼，只使用合成数据，保留签名策略、首次使用、重启、替换和旧凭据恢复检查 |
| `.github/scripts/acceptance/keychain-native.m` | 拟新增。公开签名检查所需的最小原生 probe，不导出完整 fixtures 目录 |
| `.github/scripts/acceptance/setup.mjs` | 拟新增。仅保留旧版本合成工作区准备，不引用内部测试或当前向导完整 fixture |
| `.github/scripts/acceptance/macos-display.swift` | 拟新增。从现有显示准备脚本导出，保留 Actions-only 和会话范围约束 |

不导出 `.github/workflows/ci.yml`、旧路径 `.github/scripts/macos-display.swift` 以及内部工作流 README。公开合成验收是签名交付的一部分，固定到上述四个精确路径，不能作为公开内部测试框架的入口。保留它实际需要的 Playwright 构建期依赖，不因其常用于测试而删除。其余内部测试在私有侧执行；私有仓 Actions 初始禁用，避免复制工作流后误用托管分钟。

公开安装依赖和类型检查阶段不接收 Apple 私钥；签名阶段才取得所需凭据。保留已有“拒绝 fork PR 获取签名凭据”的边界。脚本不能隐式访问私有仓或云端管理接口；Apple 签名／公证接口是这组脚本的明确用途。

### 公开说明与版本记录

| 路径 | 导出方式与边界 |
| --- | --- |
| `docs/README.zh-CN.md` | 中文公开入口，与英文 README 同步修正链接和许可范围 |
| `docs/images/readme.jpg`、`docs/images/readme.zh-CN.jpg` | 已公开产品介绍图，导出前复核不含个人数据 |
| `docs/releases/v1.7.0.md`、`docs/releases/v1.8.0.md`、`docs/releases/v1.9.0.md` | 清理为用户向历史版本说明，保留必要升级限制 |
| `docs/releases/v1.9.1.md`、`docs/releases/v1.9.2.md`、`docs/releases/v1.9.3.md` | 同上 |
| `docs/releases/v1.9.4.md`、`docs/releases/v1.9.5.md`、`docs/releases/v1.9.6.md` | 同上 |
| `docs/releases/v1.9.7.md`、`docs/releases/v1.9.8.md`、`docs/releases/v1.9.9.md` | 同上 |
| `docs/releases/v1.9.10.md`、`docs/releases/v1.10.0.md` | 同上；明确平台版本与 Plus 范围不同 |
| `docs/build.md` | 拟新增。公开安装、配置、构建与自有签名说明，不要求私有仓权限 |
| `docs/security.md` | 拟新增。端到端加密流程、密钥恢复、元数据边界、源码入口与构建对应方式；单独说明显式 AI 请求的数据流 |

以后每个版本说明按精确文件路径加入清单，不使用 `docs/releases/**` 通配。构建与安全说明须从当前实现提炼，不直接导出包含部署细节的内部规格。不得把自审称为独立安全审计，也不把开源等同于已证明端到端安全。

### 默认拒绝与精确例外

| 路径或内容 | 处理 |
| --- | --- |
| `supabase/**`、根 `scripts/**` | 全部留在私有仓，包括 SQL、Edge、计费、托管 AI、生命周期、部署及其 fixtures |
| `apps/website/**`、`apps/mobile/**`、`packages/local-store/**`、`packages/tests/**` | 首次公开树排除 |
| `apps/desktop/tests/**`、`apps/desktop/review/**`、`apps/desktop/scripts/eval/**` | 排除测试、review 工具、标注集与评估逻辑 |
| `**/tests/**`、`**/test/**`、`**/__tests__/**`、`**/fixtures/**`、`**/*.test.*`、`**/*.spec.*` | 排除；唯一当前例外为 `packages/crypto/test/vectors.json` |
| `vitest.config.ts`、`apps/desktop/scripts/test.mjs`、`debug-artifacts.mjs`、`package-experiment.mjs` | 排除测试配置、执行器、调试与体积实验工具 |
| `docs/development.md`、`docs/repository-migration.md`、`docs/features/**`、`docs/sync/**` | 内部开发、迁移、规格与自审文档留在私有仓；公开版另按上述精确路径生成 |
| 未列出的 `docs/**`，包括 `*-timing.md`、`*-baseline.md` 和优化报告 | 排除，不复制内部证据链接或供应商对象详情 |
| `AGENTS.md`、`CLAUDE.md`、嵌套架构 README、未列出的 `.github/**` | 排除。保留指定的根 README 与中文公开入口 |
| `.env*`、`.vercel/**`、`.git/**`、编辑器／代理配置、证书、私钥和 profile 实际文件 | 不进入导出内容；当前 `.env.example` 也不原样公开，构建变量改写入 `docs/build.md` |
| `node_modules/**`、`out/**`、`dist/**`、`release/**`、`output/**`、缓存和日志 | 不进入源码 Git；安装包与更新文件仅通过明确资产清单上传 |
| 用户任务、历史、SQLite、备份、导出、真实账号与凭据 | 所有路径均拒绝，不能以位于源码白名单内为由放行 |
| symlink、submodule gitlink、路径穿越、隐藏嵌套仓库、未列出的文件 | 首次导出拒绝。将来确有生产需要时先扩展政策与验收 |

上述短文件名按其实际目录匹配：调试和体积实验脚本位于 `apps/desktop/scripts/build/`。首次无需把任何根 `scripts/` 文件加入公开仓。

## 导出工具与公开历史规则

拟在私有仓新增 `scripts/public-release/`，包含生产树导出、独立审计、私有映射与操作说明；这组工具自身不导出。导出器与审计器分别检查输入，不以“由导出器生成”作为合格证明。

1. 从明确、已提交的私有源码 SHA 读取文件，不复制当前工作目录、不读取忽略文件、不自动提交未完成工作。
2. 在独立临时目录生成候选。生产源码保持原字节，只有明确记录的流程注释转换与公开构建／文档生成可改变内容。
3. 根据白名单生成根配置、五个共享包 manifest 和公开锁文件。保留生产版本，检查每个 import、类型依赖、package script 与构建资源均在公开依赖范围内。锁文件生成不得顺带升级依赖。
4. 生成候选文件清单、内容摘要和导出规则摘要。审计器同时检查路径、文件类型、源码内容、许可、私有引用与构建产物。
5. 候选提交的父提交只能是当时的公开分支头。私有提交不成为其父提交；不 merge 私有历史，不 mirror 私有 refs，也不使用共享 Git object 目录。
6. 对公开提交重跑独立检查，再正常 fast-forward 推送。公开头发生变化就停止，重新读取并生成候选；不覆盖维护者或其他分支的工作。
7. 将私有 SHA、公开 SHA、转换说明、清单及验收结果的映射只存私有侧。公开构建记录指向实际公开 SHA。

首次执行时记录所有已有公开 refs 的提交集合和切换前树摘要，作为历史边界。旧历史包含后端和测试是保留旧仓身份的明确代价，不能声明“整个历史均符合新白名单”。审计必须检查该边界之后每个新增公开提交的树与提交说明，覆盖所有新增／前移分支和 tag，禁止通过中间提交公开私有文件后再删除。首次正常切换提交移除当前树中的非白名单内容，不能因此豁免该提交的新内容检查。

## 分阶段迁移步骤

以下步骤均待执行。每阶段必须满足出口条件后，才能继续。

| 阶段 | 操作 | 出口条件与证据 |
| --- | --- | --- |
| P0 保全与盘点 | 重新读取远端 refs、Release／资产、工作流、环境与连接元数据。保全当前未提交与未跟踪改动及本地分支，不自动 stash、清理或合并。选择无丢失的源码基线 | 私有保存状态清单、各分支 SHA、WIP 位置、已有资产 SHA256、配置名称与作用域；明确哪一个提交进入候选 |
| P1 建立私有开发源 | 创建私有 `Goalloom-Dev`，先确认私有可见性与 Actions 禁用，再上传审查过的源码历史和开发 refs。排除工具临时 refs／本地 secrets；将主开发 remote 指向私有仓，保留显式 public 发布 remote | 回读私有仓名称、可见性、Actions 状态和 refs；完整源码及 WIP 可恢复；公开仓尚未变更 |
| P2 实现导出和审计 | 按本白名单生成独立候选、公开配置和锁文件；改造发布工作流；补公开构建与隐私说明 | 候选不依赖私有树，正反例均通过，生产代码差异可解释；不推送、不运行签名 |
| P3 验证候选 | 在隔离目录安装、类型检查和构建。私有侧执行迁移工具的进程 E2E，并验证公开／私有生产实现一致 | 输出机器可读报告、逐文件清单、依赖锁定差异、源码转换差异及产物边界报告 |
| P4 切换官网开发源 | 核对 Vercel 是否以现有仓为 Git 来源；如是，授权其访问私有仓并保持项目、域名、Root Directory 和环境配置，进行受控验证 | 官网下载、五语言关键页和计费回跳仍可用；旧连接可恢复；不改变 DNS、支付或后端配置 |
| P5 切换公开当前树 | 在已记录的最新公开头上创建普通子提交，移除当前树的私有内容，加入验证后的客户端与 build-only 工作流，正常推送 | 新提交满足白名单；旧 refs／Releases／资产和 URL 不变；所有后续开发进入私有仓 |
| P6 验证公开打包 | 手动运行无发布的构建验证，再按需要验证现有签名／公证链路；下载同一份安装包到私有侧验收。迁移验证不勾选 `update_draft`，不创建产品 Release | 实际公开 SHA、run／job、工具版本、资产 SHA256、签名／票据和私有原生验收相互对应；失败时停止，不影响既有版本 |
| P7 接入以后发布 | 下一次正式产品发布使用已验收的公开提交和原始安装包字节；显式选择平台，按原规则发布并回读网站与更新源 | 新 tag、更新 manifest、校验和、实际下载与源码对应；保留此前版本回读证据 |

P0 至 P7 是迁移执行范围，不是本次文档任务的执行授权。正式执行前先完成可审查的本地候选与报告，再进行所需的外部写入。

P0 与 P1 不合并当前分叉，也不丢弃未合并工作。私有仓先以当前远端主线建立主分支，再保存本地功能分支；是否将某项 WIP 纳入首个公开候选，按功能的正常验收决定。私有远端与公开发布 remote 的名称及 push 地址需明确，避免日常 push 继续发往公开仓。

## 发布流程必须处理的现有差异

### 测试与公开打包分离

现有 [release.yml](../.github/workflows/release.yml) 运行 Vitest、macOS 原生交互、签名 Keychain 与打包后 smoke，并上传报告。迁移后业务测试和内部报告留在私有侧。公开侧运行公开源码的安装、类型检查、生产构建、prepared manifest 校验、签名、公证、最小合成 Keychain 验收和安装包组成检查。

当前 `tests/keychain-signed.mjs` 强制要求临时 macOS Actions runner、已准备的临时默认 keychain，并编译同身份签名的 probe 和替换 bundle，不能原样移到普通本机。推荐将这条门禁提炼为上述公开合成验收，继续在签名 job 清理凭据前运行。只上传精确列出的合成结果与脱敏运行信息，不上传 profile、密钥、私有测试源码或私有报告目录。提炼前先列失败方式，并验证其与现有检查的覆盖关系；未证明等价就阻塞迁移后的签名交付。若不接受这一小组源码公开，必须先另定隔离签名验收环境，不能删除 runner 断言后直接在用户 keychain 上运行。

这会改变 [软件更新规格](features/updates.md) 中“托管原生测试在打包前通过”的现有工程门禁。实施时必须同步修改该规格与开发文档：明确私有源验证、公开候选构建、同一安装包的私有验收分别发生在哪里，不能仅删除工作流步骤就声称保留原验收。公开安装包没有完成所需私有验收时，不得发布。

私有仓默认本机运行测试，不使用收费托管 runner。GitHub 公开标准 runner 的构建分钟免费；私有调用方调用公开 reusable workflow，并不会把计费归属移到公开仓。参考 [GitHub Actions 计费](https://docs.github.com/en/actions/concepts/billing-and-usage) 与 [标准 runner 列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。执行前复核当时规则；不启用付费 runner、存储扩容或预算。候选中间资产短期保留，按实际免费存储额度控制使用，不将“分钟免费”写成所有资源均无费用。

### 两个平台独立发布

官网当前分别记录 macOS `1.10.0` 和 Windows `1.9.10`。现有 `draft-release.sh` 要求同一版本的两个平台资产，`release.yml` 的 draft job 也依赖两个打包 job。实施前必须把平台选择、所需资产、草稿和更新文件校验改为与实际发布范围一致，不能为了迁移强行发布 Windows Plus 或覆盖 Windows 的 `latest.yml`。

macOS 资产清单是 DMG、ZIP、ZIP blockmap 和 `latest-mac.yml`；Windows 清单是 EXE、EXE blockmap 和 `latest.yml`。`SHA256SUMS.txt` 只覆盖本次实际交付的平台文件。已有 tag 与资产保持原字节；单纯迁移验证不上传同版本候选覆盖它们。首次新产品 Release 使用新的版本身份。

### 构建可核对且不依赖开发仓

公开仓应支持 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build`，并提供使用自己配置的生产构建／打包说明。官方构建沿用现有生产配置校验；普通源码构建缺配置时保持既有本地可用行为，不新增强制账号或联网。

独立验证还要检查 native 源码、entitlements、shadcn 许可、crypto vectors 和类型声明是否齐全。`package-report.mjs` 直接使用的构建依赖必须能在公开 manifest 中明确解析，不能依赖已删除测试包偶然带来的传递依赖。

## 验收与重复验证证据

迁移工具先列出失败方式，再实现进程 E2E；不在实现后补写镜像实现的单元测试。范围至少包含以下行为：

| 验收范围 | 必须验证的行为 | 证据 |
| --- | --- | --- |
| 路径和内容边界 | 未知路径、嵌套 credentials、符号链接、路径穿越、私有导入、测试入口、文档私有链接被拒绝；crypto vectors 精确例外可用 | 合成负例输入、退出码、拒绝原因和新候选清单 |
| 导出可重复性 | 相同提交与规则导出文件字节一致；WIP 和忽略文件不进入候选；私有 Git 历史不成为公开新增祖先 | 两次文件摘要、Git 父提交检查和私有映射 |
| 正常 Git 更新 | 公共头前移会停止；切换提交正常追加；新中间提交不能夹带后端后再删除 | 临时仓库进程 E2E 和 refs 对照 |
| 独立构建 | 无私有仓访问、无 `.env` 文件时可安装／类型检查／本地构建；官方生产配置仍需正确匹配 | 完整命令、锁文件差异、产物检查和系统版本 |
| 工作流 | 仅手动触发；无私有 checkout／测试下载／部署；无发布模式不改 Release；平台资产不串用；临时凭据总能清理 | 静态工作流检查、原有 owning 场景适配、实际 build-only run |
| 安装包 | 私有侧验证 GitHub 生成的同一份安装包，核对签名、公证和公开 runner 的 Keychain 结果，再执行适用的私有 smoke；版本、签名身份和用户目录保持一致 | 下载摘要、实际签名／票据、合成 Keychain 报告、私有原生截图和报告 |
| 外部连接 | 原有下载与更新 URL、官网、OAuth 和计费回跳不因源码仓切换失效；不创建真实支付或 AI 调用 | 只读回读与必要的合成账号受控验证 |

证据拟保存到私有工作区忽略目录 `output/tests/repository-migration/<run-id>/`，包括 `inventory.json`、`allowlist.json`、`export-report.json`、`acceptance.json`、命令日志与资产摘要。报告记录私有／公开 SHA、系统、CPU、VM／物理机范围；桌面执行时记录 Electron、Node 和 SQLite 实际版本。只有公开合适的构建信息随 Release 提供，内部测试包不上传公开 Actions。

开发期间只运行改动场景和所属功能覆盖；纯迁移文档不跑桌面测试。实施阶段的入口配置变化保留 `pnpm typecheck` 和 `pnpm test`，先 build 再运行相关 E2E。发布工作流验证使用现有 `pnpm --filter @goalloom/desktop exec -- node tests/review/run.mjs package-report notarization session-profile release-workflow`，再按实际改动补受影响功能。完整 `pnpm verify` 仍只在正式发布前或明确要求时运行；不把性能、压力、100,000-task 或完整 E2E 加入日常迁移门禁。Windows 11 真机／VM 产品验收仍由负责人完成，成功构建不能代替该验收。

## 失败停止与回退

- P5 前任何失败：保留当前公开仓、现有 workflow 和官网连接，停止候选。私有仓可保留为开发副本；不删除任何仓库或源码。
- 官网连接切换失败：恢复已记录的原连接和 Root Directory，继续提供既有部署；不改 DNS，不重建账号或支付配置。
- P5 后构建失败：停止打包和发布，保留现有下载与更新资产。优先在私有源修复后重新导出，正常追加公开修复提交。
- 不直接 revert 首次切换提交，因为它会把后端和内部材料重新放回公开当前树。确需恢复旧 workflow 时，仅恢复与新白名单兼容的生产部分。
- 候选已签名但验收失败：保留失败记录和摘要，不上传正式 Release，也不重新生成一份安装包冒充已验收字节。
- 任何远端写入响应不明：先回读原始仓库、run、草稿或资产身份，再决定下一步；不自动重复发布、不强推、不覆盖已发布文件。

## 执行检查清单

- [ ] 保全分叉、未提交与未跟踪工作，确定最新源码基线。
- [ ] 盘点公开 refs、Releases、资产、环境、权限与官网连接。
- [ ] 创建并回读私有 `Goalloom-Dev`，默认禁用 Actions，验证源码与 WIP 可恢复。
- [ ] 实现生产文件导出、独立审计、公开配置生成和私有映射。
- [ ] 验证公开客户端独立构建；验证负例、历史边界和并发更新停止行为。
- [ ] 分离私有验证与公开打包，同步更新原有发布验收契约。
- [ ] 完成按平台发布与资产校验，保留现有 macOS／Windows 交付范围。
- [ ] 准备官网私有仓连接，并验证已有线上路径。
- [ ] 正常追加公开切换提交，保留旧历史、tag、Releases 与资产。
- [ ] 运行公开 build-only 与必要签名验证，在私有侧验收同一安装包。
- [ ] 后续新版本走新流程，回读源码、下载与更新 manifest 的对应关系。

本次完成范围仅为这份计划与开发文档入口。上列步骤均未执行。
