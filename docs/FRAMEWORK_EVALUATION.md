# Goalloom · QuickGUI / Tauri / Electron 评估

v0.3 · 2026-09-21。**用户已确认首版 Electron；以下保留 v0.2 的资料评估背景，不是重新选型任务。**

本轮未重新评测 QuickGUI / Tauri，也没有实际构建、性能测试或完整代码审计。

QuickGUI 本轮读到的 main 头提交为 `811d6e2816d5229711f59683c4c9dfbb6fc74133`，提交说明 Release 0.1.6。网站与 main 可能更新，结论只适用本次核查状态。[S30](SOURCES.md#s30)

## 1. 结论

用户已明确“我赞同先 Electron”。首版采用 Electron + React / TypeScript / Vite + shadcn/ui + Tailwind CSS，SQLite 本地存储。Tauri / QuickGUI 不进入首版工程；原评估保留用于解释选择，并非认定其他框架普遍不适合。

Electron 已不再待确认；M1 只验证选定路线的运行时、驱动、输入、拖拽、打包与平台范围。需要改换框架时提出新的决策，不静默替换。

这是针对本产品约束的工程判断，不是通用框架排名或实测缺陷率比较。

## 2. QuickGUI 的优势与不匹配点

项目支持 Go、TypeScript、Rust 接入，提供 GPU 渲染、响应式更新、布局与原生控件能力；macOS 可以嵌入 SwiftUI 控件。这是值得关注的原生 UI 路线。[S17](SOURCES.md#s17) [S19](SOURCES.md#s19)

但 TypeScript 路线是 **Bun + Solid 2 + Rust native renderer**，通过 bun:ffi 同进程调用；JSX 构造原生节点而非 DOM / WebView。源码文档明确 class / className 不受支持，使用 style 对象与类似 roundedLg 的 preset。[S18](SOURCES.md#s18)

因此它并不是把 React / shadcn / Tailwind 页面套进一个更轻的壳。可借鉴视觉样式，不能直接复用依赖 React DOM 与 CSS 的现有组件。类似 Tailwind 的命名也不是 Tailwind CSS 本身。[S3](SOURCES.md#s3) [S18](SOURCES.md#s18)

README 明确项目仍非常实验性，不建议用于严肃用途；官网标记 pre-alpha。TypeScript 文档还说明 Solid 2 在该 checkout 固定到 release candidate、Bun FFI 为实验性接口。[S17](SOURCES.md#s17) [S18](SOURCES.md#s18) [S19](SOURCES.md#s19)

## 3. Windows 要区分编译、打包与完整验收

README 说 Windows / Linux 能编译，平台原生体验仍在完善；TS 入门指南仍把 macOS 作为当前支持目标。边界文档指出非 macOS 的原生弹层 / 菜单、跨窗拖动和更广平台验收还有工作。[S17](SOURCES.md#s17) [S20](SOURCES.md#s20)

不能据此说「没有 Windows 代码」：更新器文档已有 Windows NSIS 和发布流程。准确结论是：**已有非 macOS 工程路径，但不能等同于承诺可发布的 Windows Todo 体验**。[S20](SOURCES.md#s20)

对于需要中文输入、拖拽、关联弹窗和长期保存的 Goalloom，采用它会增加一套 UI 重做与平台接受性验证工作。这是由上述资料得出的风险判断，并非发现 Goalloom 已发生某个 bug。

## 4. 如何理解 Tauri 的坑

| 具体问题 | 事实 / 对本项目的影响 |
| --- | --- |
| 不同 WebView | macOS WKWebView，Windows WebView2；需要分别验证 CSS、输入、焦点与滚动 [S25](SOURCES.md#s25) |
| 构建和权限 | Rust / 平台依赖、capabilities 与 CSP 增加配置工作；不应把这些统称成不可解决的 bug [S9](SOURCES.md#s9) [S27](SOURCES.md#s27) |
| 看板拖放 | 官方说明 Windows HTML5 拖放需关闭 dragDropEnabled 的拦截；不能推断所有拖拽库都不工作 [S26](SOURCES.md#s26) |
| SQLite | 可用 Rust 驱动或官方 SQL 插件；JS API 不代表自动拥有所有多步事务语义 [S15](SOURCES.md#s15) [S28](SOURCES.md#s28) |
| 发布 | 签名、公证、安装与升级依旧要做，不由换框架自动解决 [S7](SOURCES.md#s7) [S8](SOURCES.md#s8) |

目前没有对三种框架进行同条件 Goalloom 测试，不能给出「坑的数量」或保证哪一种无 bug。原推荐 Tauri 的理由是轻量桌面；现在用户强调第一版简单，应把熟悉的语言、交付路径与数据库稳定性放在更高优先级。

## 5. Electron 的取舍

Electron 提供完整 Chromium + Node.js，跨 Windows / macOS，并让前端保留 HTML / CSS / React 方式。对已指定 shadcn / Tailwind 的本项目，这条路线更容易复用现有 UI 技能；这属于工程推断，不是工期承诺。[S21](SOURCES.md#s21) [S3](SOURCES.md#s3)

代价是分发时携带浏览器运行时，不能把安装体积和内存问题视为不存在；确切差异要实测。不同平台的字体、窗口、IME 和签名仍需测试，统一 Chromium 不是完全没有平台差异。

Electron 也有坑：main / preload / renderer 安全边界，IPC 参数与来源校验，原生 SQLite 包的 ABI / CPU 架构 / 打包问题，运行时安全更新。不能因使用 TypeScript 就跳过它们。[S22](SOURCES.md#s22) [S23](SOURCES.md#s23)

## 6. 决策矩阵

以下为适配判断，不是测量分数。

| Goalloom 需求 | QuickGUI 当前状态 | Tauri 2 | Electron |
| --- | --- | --- | --- |
| 直接沿用 shadcn / Tailwind | 不匹配其 native Solid 渲染路线 | 可承载 Web 前端 | 可承载 Web 前端 |
| TS 熟悉度复用 | TS 可用，但 UI / runtime 换成 Bun + Solid | UI TS，平台层 Rust / 插件 | UI、主进程、桥接均可 TS |
| macOS + Windows 首发 | Windows 原生验收仍未完成 | 有对应桌面分发路线，仍需产品测试 | 有对应桌面分发路线，仍需产品测试 |
| 优先控制体积 | 值得研究，非本项目实测 | 不随应用携带完整 Chromium | 携带 Chromium + Node |
| v0.3 决策 | 不采用 | 历史备选，本期不实现 | **已确认采用** |

依据：S17–S28的v0.2资料核查。矩阵是历史适配分析；用户已确认Electron，下面的验证是实施门槛，不是要求再比较三套工程。

## 7. 先做一个小型真实验证

只用已确认的Electron路线做两列试验，覆盖录入中文、跨列排序、关联选择器、SQLite重启恢复、导出 / 恢复及两个系统的安装。不要先在浏览器堆完功能才第一次打包。

必须记录：所选 runtime 与驱动版本、操作系统 / CPU、打包方式、启动与稳定内存、成功与失败恢复结果。不设置凭空推测的内存数字，也不保证一两天能完成。

用户已选择以Electron推进；无需并行验证Tauri或QuickGUI。若后来有实测阻断，再记录证据和新的改选提案。

## 8. Benchmark 边界

QuickGUI 官网的 benchmark 是作者在同一台 Mac 上运行 1,000 条 issue 的演示，测安装体积与闲置内存；说明中特别指出数据在内存、没有数据库或网络，未测交互吞吐。不能直接当作 Goalloom 的内存、拖拽性能或 Windows 发布质量证明。[S19](SOURCES.md#s19)

本轮没有复现该 benchmark，没有在 macOS 或 Windows 实际构建三种框架，也没有评估商店审核通过率。
