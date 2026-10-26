# apps/website/ — Goalloom 官网

Next.js 16 App Router · React 19 · TypeScript · 纯 CSS · Hugeicons · 静态导出（`output: 'export'`）

> 父级：[项目地图](../../docs/development.md)。产品规则、工程契约、TODO 与验收的唯一来源：[docs/features/website.md](../../docs/features/website.md)；本文件只做目录导航与命令。

官网是营销页，不是第二份产品实现：演示复刻产品可见的规则与尺寸（纸感 token、32px 最小行高与自动换行、18px 复选框、24px 二级缩进、URL 预览、实测关系线几何及 composer 单条建议句式），产品行为仍归 `apps/desktop/src/`。

## 目录

```text
app/            # 两棵根布局：(default)=英文无前缀（x-default），[locale]=zh-CN/ja/es/fr；首页、pricing/、privacy/、terms/、billing/continue/、billing/return/、sitemap、robots
app/styles/     # tokens（1296px 全站统一上限）→ base（共享路由容器）→ board → hero → hero-phone（同步场景设备构图）→ sections → video-intro（顶部对齐的作者说明/头像与反色影片封面，右栏同定价/FAQ 列宽）→ legal（吸顶 Header、目录及正文锚点避让）→ services（定价/状态）→ download（分段按钮/平台菜单）→ motion
components/     # site-document、boot、theme、theme-transition（原生圆形主题扩散）、motion、icons、site-header（信息页偏好控件）、download-button（分段下载）与 use-dismissible-menu（共享菜单关闭）；共享 faq-list、site-footer 与 legal-page
components/board/  # Board、实测连线几何、URL 预览与 Composer，Hero（含手机预览）及后续演示共用；见模块 README
components/services/ # 五语言静态定价、首页/定价页共用双卡与 Free 下载、首页左标题布局、费用/AI 说明弹层、私密支持及关闭的购买状态壳；见模块 README
components/home/   # hero-demo、hero-phone（同步场景的只读手机）、product-tour（左连续 ADHD 原文/作者头像，右安静放映）、video-intro（反色封面/原生播放器，无外部说明和时长）、lines-story/jev-demo（当前未挂载的演示组件）、sections、home-page、faq-section（免费/试用/安全/退款问答及行内支持链接）；手机复制链接位于共享 components/copy-link
lib/            # board.ts（演示工作区 + deriveView 规则）、release.ts（仓库与下载快照）
lib/i18n/       # locale 路径、metadata（canonical/hreflang/OG）、catalogs/ 五语言（en 定义结构，其余由类型强制对齐）
lib/legal/      # types.ts 内容契约、联系邮箱与生效日期；catalogs/ 五语言政策及条款；index.ts 页面元数据
lib/services/   # 受控价格/开放开关、五语言服务文案、页面 metadata；见模块 README
lib/seo/        # 站点身份、JSON-LD 和 routes.json（公开/不索引路由清单）
public/         # 明暗壁纸、og.png、icon.svg、app-icon.png、product-tour.mp4（确认预览中的 10.4 秒静音中文界面演示）
scripts/        # audit-seo.mjs（20 个公开页 + 10 个不索引辅助页）、e2e.mjs + hero-demo-cases.mjs（可操作 Hero）+ hero-sync-cases.mjs + video-intro-cases.mjs + legal-cases.mjs + service-cases.mjs + policy-cases.mjs + theme-cases.mjs + download-cases.mjs + faq-cases.mjs（端到端验收与截图产物）
```

## 发布

- Vercel 项目 Root Directory = `apps/website`，生产域名 `https://www.goalloom.com`。
- 本地项目关联与环境配置保存在本目录的 `.vercel/`，保持 Git 忽略；在此目录运行 `vercel pull --yes --environment=production` 可刷新当前项目设置，不触发部署。
- 新版本发布后更新 `lib/release.ts`（版本、资产名、`published`），规则见功能规格的「工程契约」。

## 服务发布边界

Plus purchase and explicit account-trial actions are available only in the supported macOS client after the unified production cutover. The static site provides localized information and finite, explicit app continuation; it does not authenticate accounts, create Checkout sessions or determine payment status. Public availability follows the reviewed release snapshot and production evidence. Historical closed-gate reports retain their original scope. Windows Plus and mobile purchases are deferred.

`output/tests/e2e/service-boundaries.json` 保存受控状态、网络与静态 Secret 扫描，`billing-policy.json` 保存五语言政策验收证据；不等同于提供商付费生命周期或客户端验收。

The shared support contact is `hellojimmywong.ai@gmail.com`, defined by `SERVICE.supportEmail`. All five locales use it for pricing, FAQ, footer, privacy and terms contact links.

D2 的五语言政策按上线范围说明：受限取回生成独立本地副本，解密材料留在设备，替换当前工作区须明确选择并有保护性备份；账号设置中的期限和应用内提醒不延长取回窗口。续费失败宽限从原续订截止计算。7 天在线删除仍是上线要求。在线删除后，受限灾难恢复副本可能保留至适用基础设施服务商的保留政策规定的到期时间，不作为账号恢复或继续服务的入口；基础设施恢复后，须在恢复访问前重新应用删除记录，不承诺请求时即物理擦除。文案不代表供应商或生产备份/恢复执行已获验收，也不新增每日备份承诺。官网不处理账号删除，也不增加邮件或系统推送。

## 命令

```sh
pnpm install          # 在 apps/website/ 内执行
pnpm dev              # 本地开发
pnpm build            # 静态导出到 out/ 并运行 SEO 审计
pnpm typecheck
pnpm test:e2e --no-build # 已构建当前源码后，仅运行官网验收
pnpm test:e2e --no-build --only=hero-demo # Hero 看板操作与同步专项，产物在 output/tests/hero-demo/
pnpm test:e2e --no-build --only=hero-sync # Hero 同步场景专项，产物在 output/tests/hero-sync/
pnpm test:e2e --no-build --only=video-intro # 作者说明/头像与视频专项，产物在 output/tests/video-intro/
pnpm test:e2e --no-build --only=legal # 隐私/条款与政策专项，产物在 output/tests/legal/
pnpm test:e2e --no-build --only=faq # FAQ layout, disclosures and downloads; output/tests/faq/
pnpm test:e2e --no-build --only=download # Header/home/pricing downloads; output/tests/download/
pnpm test:e2e --no-build --only=services # 定价/服务与政策导航专项，产物在 output/tests/services/
pnpm test:e2e --no-build --only=legal --output-prefix=contact-review-001 # Preserve prior evidence in a fresh output/tests/contact-review-001/legal/ directory; reusing that directory is rejected
pnpm test:e2e --no-build --only=billing # D1 有限回跳/会话恢复专项；canonical 受控拦截，无提供商或原生 App 调用，产物在 output/tests/billing/
pnpm test:e2e         # 构建 → 本地静态服务 → Playwright 端到端验收；报告与截图写入 output/tests/e2e/
```

[PROTOCOL]: Update this header when making changes, then check README.md.

The release snapshot stores each platform independently. Current Plus availability applies to macOS 1.10.0 only; the Windows 1.9.10 installer remains the older free client. Website purchase guidance directs users to explicit actions in the supported desktop app. The static site does not create Checkout sessions or activate trials.
