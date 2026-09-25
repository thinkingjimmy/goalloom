# website/ — Goalloom 官网

Next.js 16 App Router · React 19 · TypeScript · 纯 CSS · Hugeicons · 静态导出（`output: 'export'`）

> 父级：[../README.md](../README.md)。卖点与文案来源：[docs/features/website.md](../docs/features/website.md)。

官网是营销页，不是第二份产品实现：演示复刻产品可见的规则与尺寸（纸感 token、48px 行、18px 复选框、关系线几何、composer 的单条建议句式），产品行为仍归 `src/`。

## 目录

```text
app/            # 两棵根布局：(default)=英文无前缀（x-default），[locale]=zh-CN/ja/es/fr；sitemap、robots、globals.css
app/styles/     # tokens（纸感明暗）→ base → board（产品同款看板/composer/toast）→ hero（header、收缩舞台）→ sections → motion
components/     # site-document（html lang、首帧主题/平台脚本）、boot、theme、motion、icons、site-header
components/board/  # Board（列/行/关系线）与 Composer，三处演示共用
components/home/   # stage（滚动收缩/浮动 header）、hero-demo、lines-story、jev-demo、sections、home-page、copy-link
lib/            # board.ts（演示工作区 + deriveView 规则）、release.ts（仓库与下载快照）
lib/i18n/       # locale 路径、metadata（canonical/hreflang/OG）、catalogs/ 五语言（en 定义结构，其余由类型强制对齐）
lib/seo/        # 站点身份与 JSON-LD
public/         # 明暗壁纸、og.png、icon.svg、app-icon.png
scripts/        # audit-seo.mjs（构建门禁）、e2e.mjs（端到端验收与截图产物）
```

## 约定

- **一个事实一个来源**：下载链接与版本只在 `lib/release.ts`；站点域名只在 `lib/seo/site.ts`；看板规则只在 `lib/board.ts`；文案只在 `lib/i18n/catalogs/*`。
- **多语言**：与应用相同的五种语言。新增文案先改 `en.ts`（它定义结构），TypeScript 会要求其余四份补齐；演示里的界面词（列名、「全部」、Jev 句式、Toast）逐字取自 `src/renderer/i18n/locales/*`。不按浏览器语言重定向，语言切换是普通链接。
- **首帧事实**：主题（auto/light/dark）与平台（Windows 以外默认 macOS）在 `<head>` 内联脚本里决定，避免深色白闪和下载按钮改口；脚本不跑时页面仍完整可用。
- **动效**（与 Bottega 同一套规则）：首屏在 360px 滚动跑道上 smoothstep 收缩成带圆角的舞台并让出 header；滚过首屏后浮动 header 接班；各节只在位于首屏下方时由脚本隐藏、进入视口后单向淡入；轮播每格 5 秒、进入视口才走、用户一选即停；`prefers-reduced-motion` 下全部静止到位。窄屏（≤900px）不演收缩，窗口只留「今天」一列，关系线改为缩进链路列表。
- **隐私**：不加载分析脚本、字体或任何第三方请求。

## 发布

- `lib/release.ts` 的 `RELEASE.published` 为 `false` 时下载按钮打开 GitHub Releases 页；公开发布后改为 `true` 并核对版本号与资产名（`Goalloom-<ver>-mac-arm64.zip`、`Goalloom-<ver>-win-x64.exe`）。
- Vercel：新建项目指向本仓库，**Root Directory = `website`**，Framework = Next.js，其余默认。`website/` 自带 `pnpm-workspace.yaml`，依赖不会进入根目录 Electron 的 `node_modules`。生产域名是 `https://www.goalloom.com`（`goalloom.com` 由 Vercel 308 跳转过来）；站点地址只在 `lib/seo/site.ts`，两份脚本各保留一份同值常量，改域名时三处一起改。上线后在 Search Console 提交 `https://www.goalloom.com/sitemap.xml`。

## 命令

```sh
pnpm install          # 在 website/ 内执行
pnpm dev              # 本地开发
pnpm build            # 静态导出到 out/ 并运行 SEO 审计
pnpm typecheck
pnpm test:e2e         # 构建 → 本地静态服务 → Playwright 端到端验收；报告与截图写入 output/e2e/
```

[PROTOCOL]: Update this header when making changes, then check README.md.
