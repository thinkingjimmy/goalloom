# 官网

> 面向用户的产品官网（`website/`，部署于 https://www.goalloom.com）：用可操作的产品演示讲清两个卖点——OKR 驱动的 Todo 与 Jev 智能输入。营销页不是第二份产品实现：演示复刻产品可见的规则与尺寸，产品行为仍归 `src/`。

## 卖点与叙事（所有者原文）

产品有几个核心卖点：

- OKR 理念驱动的 Todo 功能
- 智能推荐与分析：新建任务时，系统会根据你的历史 Todo 和目标，智能推荐相关关联。

为何是 OKR 理念驱动的 Todo 功能？

我每年都会做一次年终总结，总结去年的任务完成情况的同时，还会制定本年的任务。

但我每次总结完，我都发现好像过去一年又没有做什么。但我明明也在使用各种 todo 工具，每日跟进任务，为何会这样？

于是我翻开我的 todo 记录，我发现，虽然我每天都在跟进任务，但很多时候，todo 列表里都列满了紧急的任务，但年度计划却因为其不紧急，被不断推迟，最终导致年度目标难以实现。

生活中你会遇到很多紧急的任务，但说实话，这些任务虽然紧急，但并不一定重要。而真正重要的任务，往往并不紧急，如果不加以规划和跟进，很容易被日常的紧急事务所淹没。然后，年度目标就会被不断推迟，最终年末发现自己并没有完成想要实现的目标。

所以我就想到是否可能使用 OKR 理念来驱动我的 Todo 功能，将年度目标分解为季度目标，再分解为月度目标和每周任务，并在日常的 Todo 中进行跟进。这样一来，日常的紧急事务虽然仍然存在，但重要的年度目标不会被忽视，最终能够更好地实现自己的目标。

为何要做智能推荐？

因为我是个 ADHD 患者，我的注意力容易分散，常常难以专注于长期目标。智能推荐功能可以根据我的历史 Todo 和目标，帮助我更高效地安排任务，确保重要的年度目标不会被忽视。同时也能减少创建 todo 的成本。

本产品使用 Jev 模型作为智能推荐的核心引擎，根据用户的历史 Todo 和目标，提供个性化的任务推荐和分析。创建任务的速度非常快。

## 产品规则

### 页面结构

- 自上而下：站点 header → 可操作的首屏桌面 → 作者寄语 → 「OKR · Todo」大段（01 关系线轮播）→ 「Smart input · Jev」大段（02 随手记下动图 + 四张卡片）→ 下载与 FAQ → 页脚。
- 首屏是一台桌面：macOS 菜单栏只模仿系统菜单（不放网站导航与 CTA），窗口是真实比例的 Goalloom 看板，底部场景条切换「目标看板 / 智能输入 / 关系线」。
- 首屏演示可操作：悬停行、按目标筛选（关系线）、筛选后悬停看整条链路、完成复选框、经 composer 新建（Jev 单条句式）、Toast 撤销、Esc 关闭 composer。
- 关系线段是四个案例按钮驱动一张配图：一键筛选、悬停看整条链路、目标拆成多步、键盘友好；每格停 5 秒，进入视口才走，用户一选即永久停止。
- Jev 段是一段循环动图：+ 提示 → 打开 composer → 逐字输入 → 「Jev 整理中…」→ 单条建议 → 按下「创建到今天」→ 条目带目标色落进今天 + Toast；只在可见时播放。
- 作者寄语使用居中引文，两处关键词加深。

### 文案、语言与视觉

- 语言与应用一致：en（无前缀，同时为 x-default）、zh-CN、ja、es、fr；不按浏览器语言重定向，语言切换是普通链接。
- 演示中的界面词（列名、「全部」、Jev 的放置句式、Toast、占位符）逐字取自 `src/renderer/i18n/locales/*`，不另写近义说法。
- 视觉沿用产品纸感主题（明暗两套 token）与 Hugeicons；标题为紧凑无衬线体，章节标签为等宽大写。明暗默认跟随系统，header 可切换并记住选择。
- 下载按访问者系统展示：Windows 访客首推 Windows 安装包，其余默认 macOS，另一平台在下方一行；手机访客额外提供「复制链接到电脑」。

### 动效

- 首屏在 360px 滚动跑道上 smoothstep 收缩为带圆角的舞台并让出站点 header；header 只在带子装得下时淡入；滚过首屏后由浮动 header 接班，同一时刻只有一条导航。
- 各节只在位于首屏下方时由脚本隐藏、进入视口后单向淡入；无脚本时页面完整。
- `prefers-reduced-motion` 下：不收缩动画、不轮播、Jev 动图停在建议态、各节直接可见。
- 窄屏（≤900px）不演收缩：header 为普通横条，窗口只留「今天」一列，关系线改为缩进链路列表，Jev 段 composer 原地演示。

### 隐私

- 不加载分析脚本、第三方字体或任何第三方请求。

## 工程契约

- `website/` 是独立 pnpm 根（自带 `pnpm-workspace.yaml`），Next.js 静态导出；Vercel 项目 Root Directory = `website`，依赖不得进入根目录 Electron 的 `node_modules`。
- 单一事实来源：站点地址 `website/lib/seo/site.ts`（`scripts/audit-seo.mjs` 与 `scripts/e2e.mjs` 各保留一份同值常量，改域名三处同改）；下载版本与资产名 `website/lib/release.ts`；看板演示规则 `website/lib/board.ts`（筛选点亮、悬停链、跨级虚线，与 `relation-lines.md` 一致）；文案 `website/lib/i18n/catalogs/*`（`en.ts` 定义结构，其余语言由类型强制对齐）。
- 主题与平台在 `<head>` 内联脚本中于首帧前决定（`components/boot.ts`），不得挪进 `"use client"` 模块。
- 构建门禁：`pnpm build` 之后运行 SEO 审计，逐页解析标签属性（托管方可能重排属性），要求 html lang、自指 canonical、互指 hreflang（含 x-default）、description、og:image、JSON-LD，以及 sitemap、robots、社交图存在。
- 生产域名为 `https://www.goalloom.com`，`goalloom.com` 由 Vercel 308 跳转；canonical、hreflang、sitemap、og 一律使用 www。

## TODO

- [x] 官网首版：五语言静态站、可操作首屏、关系线轮播、Jev 动图、明暗主题、平台感知下载、窄屏布局、滚动动效。
- [x] 部署 Vercel 并绑定 www.goalloom.com；Search Console 提交 `https://www.goalloom.com/sitemap.xml`。
- [ ] 首屏壁纸补 2880px 宽的高清版本（现为 1586px）。
- [x] 发布公开 Release 1.0.0 并更新 `website/lib/release.ts`（版本、资产名、`published: true`）。

## 验收

- [x] `cd website && pnpm typecheck` 通过。
- [x] `cd website && pnpm build`：五语言页面、sitemap、robots 静态导出，SEO 审计通过；Vercel 线上构建同样通过。
- [x] `cd website && pnpm test:e2e`（Playwright Chromium 驱动本地静态服务）25/25：五语言 SEO 标签、首屏收缩与浮动 header、看板筛选/悬停链/新建与撤销/Esc/完成/场景切换、关系线轮播自动播放与点选即停、Jev 动图落入今天、明暗切换与持久化、macOS/Windows 访客下载、窄屏无横向溢出与单列、减少动效。报告与截图写入 `website/output/e2e/`。
- [x] 线上 https://www.goalloom.com：五语言页面、sitemap、robots、社交图 200；canonical/hreflang/og 为 www。
- [ ] Windows 11 真机浏览与 Safari/Firefox 浏览器目测由所有者人工验收。
