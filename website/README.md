# website/ — Goalloom 官网

Next.js 16 App Router · React 19 · TypeScript · 纯 CSS · Hugeicons · 静态导出（`output: 'export'`）

> 父级：[项目地图](../docs/development.md)。产品规则、工程契约、TODO 与验收的唯一来源：[docs/features/website.md](../docs/features/website.md)；本文件只做目录导航与命令。

官网是营销页，不是第二份产品实现：演示复刻产品可见的规则与尺寸（纸感 token、40px 无分隔线的行、18px 复选框、关系线几何、composer 的单条建议句式），产品行为仍归 `src/`。

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

## 发布

- Vercel 项目 Root Directory = `website`，生产域名 `https://www.goalloom.com`。
- 新版本发布后更新 `lib/release.ts`（版本、资产名、`published`），规则见功能规格的「工程契约」。

## 命令

```sh
pnpm install          # 在 website/ 内执行
pnpm dev              # 本地开发
pnpm build            # 静态导出到 out/ 并运行 SEO 审计
pnpm typecheck
pnpm test:e2e         # 构建 → 本地静态服务 → Playwright 端到端验收；报告与截图写入 output/e2e/
```

[PROTOCOL]: Update this header when making changes, then check README.md.
