# 官网

> 面向用户的产品官网（`apps/website/`，部署于 https://www.goalloom.com）：用可操作的产品演示讲清两个卖点——OKR 驱动的 Todo 与 Jev 智能输入。营销页不是第二份产品实现：演示复刻产品可见的规则与尺寸，产品行为仍归 `apps/desktop/src/`。

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

- 自上而下：站点 header → 可操作的首屏桌面 → 作者缘由与视频（左侧原始 ADHD 描述/Jimmy 头像，右侧视频）→ Free/Plus 双卡权益对照 → FAQ → 页脚。不再重复渲染原关系线和智能输入独立大段。
- FAQ 采用已确认的「双栏折叠」：左侧为标题与说明，右侧共五个问题，依次为「哪些功能免费使用？」「支持试用吗？」「我的数据安全吗？你们能看到我的数据吗？」「是否支持退款？」「还有其他疑问？」。不再列出普通 Todo 对比、Jev、安装方式、iPhone 版本、账号/同步密码/付费关系或支持系统问题；独立定价页政策与下载菜单不受影响。首项默认展开，原生 details 同组一次展开一项，以 Hugeicons 加减号指示状态。免费、试用和退款答案按稳定 ID 直接复用当前定价政策；试用须说明 8 天/192 小时、主动激活、免绑卡、不自动扣费及当前未开放，退款不得承诺无条件退款。数据安全回答说明本地 SQLite/备份、同步密文与密钥边界、必要账号/同步元数据、可选 AI 的可读上下文处理，以及本地数据库/导出/备份不因同步而自动加密。最后一项为带私密支持与 GitHub 技术反馈行内链接的完整正文句子，不使用独立按钮行或外链图标。900px 及以下上下排列，五语言、键盘和无 JavaScript 均可用。
- FAQ 问题列表不显示最顶部和最底部的横线，仅保留相邻问题之间的分隔线。
- 共用定价卡价格与按钮之间保留约 32px（包含年付节省说明行），缩小原有留白；月付/年付切换时卡片和两张卡的价格、按钮位置保持稳定。
- 首页 FAQ 上下 padding 由桌面各 100px 减为各 50px，手机各 56px 减为各 28px；首页 Pricing 上/下由桌面 100/80px 减为 50/40px，手机各 56px 减为各 28px。独立定价页的 FAQ 留白不变。
- FAQ 回答使用右侧问答栏的可用宽度自然换行，不单独限制字符行宽；右侧保留展开图标对应的内边距。
- 全站 Header、Hero、正文和页脚统一使用 1296px 最大宽度，所有语言和首页/定价/法律/计费页面共用此容器并居中。Hero 直接位于 Header 下方，无额外滚动跑道。容器通过正常文档宽度限制，避免 100vw 造成传统滚动条下的横向溢出。
- Hero 与内部产品窗口共用 12px 圆角，桌面和手机保持一致；保留 1px 主题边框，壁纸与菜单栏裁切到圆角内，边框不增加容器宽度。
- Header 不显示底部分隔线，避免横线与 Hero 圆角边框叠加。
- Header 使用当前主题的不透明页面背景，滚动时遮住下方内容，不使用背景模糊。
- 全站 Header 不显示「版本发布」「目标看板」「智能输入」入口。
- Header 不额外增加水平内边距，品牌和下载按钮对齐 1296px 正文容器两侧；Hero 使用同一宽度上限。手机均随可用宽度收缩。
- 后续 Section 和页脚同样不额外增加水平内边距，正文列、演示图与 Header 共用 1296px 容器的两侧边界；卡片内部保留自身留白。
- 首屏是一台桌面：macOS 菜单栏左侧模仿系统菜单，右侧放语言、主题控件及时间（不放网站产品导航与下载 CTA），窗口展示 Goalloom 看板，底部为「关系线 / 智能输入 / 端到端同步」三个场景，关系线排第一且默认选中，首帧筛选发布流程；没有「目标看板」场景标签。场景标签支持左右方向键与 Home/End。
- 同步场景在看板右下角叠放手机外框，沿用纸感主题、32px 行、18px 复选框与 24px 子项缩进，显示相同的今天任务和完成/新建/撤销状态。手机画面只读，辅助技术说明其为移动端设计预览；可见界面不再显示「移动端预览」或加密状态提示，不连接同步后端、不表示 iPhone 已发布。桌面整体构图为手机留出空间，按实际 Hero 容器宽度聚焦月/周/今天三列；容器不宽于 1254px 时显示周/今天，保留今天的产品列宽；Add 保持看板右下角 24px 内缩，不单独左移。900px 及以下保留单列看板，不叠放第二台手机，三场景标签均保留 44px 触摸高度。
- 首屏演示可操作：悬停行、按目标筛选（关系线）、筛选后悬停看整条链路、完成复选框、经 composer 新建（Jev 单条句式）、Toast 撤销、Esc 关闭 composer。Hero composer 不显示「全局＋用于收集或智能整理；列头＋仍在对应列快速录入。」这条底部说明，各语言一致。
- 看板遵循当前产品纸感样式：18px 复选框、32px 最小行高、标题完整换行，续行与复选框左侧对齐；桌面时间列最小 320px，较窄窗口在内部横向滚动，手机仍只显示今天。
- 演示包含官网/仓库 URL：行内图标与页面标题、128px 高预览卡及外链均复刻产品样式。卡片只使用已知公开地址、五语言静态文案及本地图片，不访问远程元数据或图标；点击链接才打开外部页面。
- Hero 今天列移除「核对关系线与任务缩进」及仓库预览（d7），桌面三场景、手机同步镜像和无脚本首屏一致；后续关系线案例保持自身演示数据。今天列展示两级 Todo：保留「检查手机端布局」子项，子项与流程圆点缩进 24px，继承流程并各自完成，不联动父项或兄弟。连线只画目标 → 父项 → 子项，不重复画继承的目标边；使用 DOM 实测首行锚点和 5px 圆角路径，标题换行、URL 卡片与缩放后仍贴合。
- 正文介绍区不再提供关系线/AI 切换按钮，也不挂载对应配图和动图；Hero 的关系线、智能输入和同步三场景继续保留。
- Hero 下方采用确认的「安静放映」：左侧为最早的五语言 ADHD 作者原文，连续一段、常规字重，不加粗、不强制断行；标题为「为什么做 Goalloom」，保留 Jimmy 头像/作者链接，没有左侧按钮。右侧为反色主题的文字视频封面，包含品牌、标题、短注与文字播放按钮；影片外部不显示说明或时长。桌面与定价、FAQ 共用 minmax(200px,.3fr)/1fr 列宽及 80px 列间距，左侧内容与视频顶部对齐，保留 60px 节留白；视频左右边界和宽度与其他 Section 的右侧内容栏一致，文字栏最大 340px，正文 17px/1.7，头像 36px。900px 及以下上下排列、44px 节留白、文字栏最大 420px；360px 及以下正文 16px。两侧外边界继续与 1296px 正文容器对齐。返回封面控件位于播放器内部右上角，播放不改变节高度。原文和头像来自既有站点内容，不新增个人健康信息。无 JavaScript 时作者说明、头像和原生视频仍可访问。
- 产品视频沿用确认预览中的 10.4 秒 H.264 静音中文界面演示（`public/product-tour.mp4`，约 140KiB）。原生 video 配合 details：默认封面、`preload=none`，点击播放并显示原生控制条，可返回封面、键盘操作和结尾重播；离开视口或页面隐藏时暂停，不自动恢复。失败回到封面并给出可重试反馈，过期播放请求不能覆盖当前操作。无 JavaScript 时封面仍可原生展开、控制播放和返回封面；五语言辅助说明交代演示内容及静音/中文界面。不加载外部播放器或被动媒体请求。

### 文案、语言与视觉

- 语言菜单在点击或触摸外部空白处、其他控件时关闭，不阻止该控件的操作或抢走焦点；点击菜单内部留白保持展开。菜单内按 Esc 关闭并将焦点返回语言按钮。Hero、信息页 Header 与页脚共用此行为；无 JavaScript 时保留原生展开和语言链接。

- 语言与应用一致：en（无前缀，同时为 x-default）、zh-CN、ja、es、fr；不按浏览器语言重定向，语言切换是普通链接。
- 演示中的界面词（列名、「全部」、Jev 的放置句式、Toast、占位符）逐字取自 `apps/desktop/src/renderer/i18n/locales/*`，不另写近义说法。
- 视觉沿用产品纸感主题（明暗两套 token）与 Hugeicons；标题为紧凑无衬线体，章节标签为等宽大写。明暗默认跟随系统并记住选择。首页语言和主题控件位于 Hero 菜单栏右侧、时间之前，网站 Header 不重复显示；其他信息页仍在 Header 显示。菜单保留键盘和屏幕阅读器可达性，装饰文字单独隐藏，语言链接无 JavaScript 也能使用。手机状态栏高 44px，控件至少 44×44px，语言收为图标，时间保持可见。语言和主题控件的 hover／展开背景上下各内缩 3px，点击区域不缩小。
- 下载通过 Header 和首页 Free 卡共用的分段按钮访问：左侧按访问者系统直接下载（Windows 访客首推 Windows 安装包，其余默认 macOS），文字右侧放系统图标；右侧独立箭头下拉展示其他已发布系统的安装包和最低系统要求。菜单支持外部点击/触摸收起、Esc 返回箭头焦点、选择后关闭；无 JavaScript 也能展开并访问普通下载链接。不新增未发布系统；手机「复制链接到电脑」移至下载菜单。`#download` 锚点仅定位 Header 下载控件，`#faq` 定位问答；正文不再显示独立大下载宣传区。
- Header 下载按钮在桌面高 36px，9px 圆角；900px 及以下保留 44px 控件高度和箭头宽度，保证触摸区域。

### 动效

- 点击同步场景时，手机以 280ms ease-out 淡入并上移 20px、从 .97 缩放到 1；退出为 180ms，使用原生 CSS transform/opacity 过渡，可中途反向切换。隐藏时立即从辅助技术与点击目标中移除，视觉淡出结束后隐藏。键盘场景切换、首屏加载与减少动态效果时不播放；无定时器或动画依赖。
- 主题按钮沿用个人站的圆形扩散：从按钮中心向视口最远角展开，550ms、ease-in-out，使用原生 View Transitions 与新快照的 clip-path；明暗双向相同。仅指针操作播放，键盘、系统主题变化、减少动态效果或不支持的浏览器直接切换。保留主题记忆及跟随系统，快速点击以最新意图为准；失败或中断不留下快照与输入遮挡。参考 `thinkingjimmy/jimmywong-dev` 的 `theme-toggle.tsx`，核对提交 `562751bbcaafe53218013b6b3a85bc9ab219c6b8`。
- 首屏随页面正常滚动，不收缩、不固定、不按滚动改变尺寸或圆角。单一 header 首帧可见，首页滚动时保持在顶部，锚点标题留出 header 高度；禁用 JavaScript 时同样成立。
- 各节只在位于首屏下方时由脚本隐藏、进入视口后单向淡入；原生锚点目标直接显示且不位移，避免定位在 Header 后方；无脚本时页面完整。
- `prefers-reduced-motion` 下：不轮播、Jev 动图停在建议态、各节直接可见。
- 窄屏（≤900px）header 为 60px 横条，Hero 保持全宽；窗口只留「今天」一列，关系线改为缩进链路列表，Jev 段 composer 原地演示。

### 隐私

- 首页、定价、法律及关闭的计费壳不加载分析脚本、第三方字体、支付 SDK 或被动第三方请求。外部资源仅由用户点击普通链接访问；未来计费后端的最小白名单不能放宽普通页面隔离。
- 官网 `/privacy/` 与 `/terms/` 提供正式英文隐私政策和服务条款；其余四种语言沿用既有前缀，内容完整，不回退英文。全部为静态正文，未登录、禁用 JavaScript 时仍可阅读。
- 政策描述实际数据流：本地 SQLite／备份、Apple/Google 基本账号信息、可选端到端加密同步及未加密运行元数据、可选 AI 上下文、链接预览、更新与基础设施日志；不承诺退出即删除、无日志或即时清除所有备份。
- 隐私与服务联系邮箱为负责人确认的 `hellojimmywong.ai@gmail.com`，通过 `SERVICE.supportEmail` 统一用于五语言客服、账单、退款、删除支持、FAQ、页脚、隐私及条款联系入口；当前源码政策日期为 2026-10-25，运营者为 `Augmenting Human Intellect, LLC`。服务条款保留 MIT 和服务端 AGPL 的既有权利；原“不引入订阅”限于免费公开版，不阻止说明尚未开放的可选 Plus。条款不自动订阅，不新增管辖地或强制仲裁安排。
- 首页与法律页面复用页脚，桌面和手机均显示隐私与条款入口。法律页面语言切换保留当前文档，顶部品牌链接返回对应语言首页。
- 隐私与条款页沿用全站不透明吸顶 Header，桌面和手机滚动时均固定在视口顶部；桌面目录在 Header 下方 24px 吸顶并限制在剩余视口内，正文目录锚点同样避让 Header 24px。移除页面顶部的独立 Plus 政策提示框，现有条款正文保留。
- 法律页面沿用纸感明暗主题，提供目录锚点、联系邮箱和服务商政策链接；canonical、hreflang、WebPage JSON-LD 和 sitemap 覆盖全部十个文档地址。

### 服务、价格与开放状态

- 本地任务、历史、备份、导入导出和 BYOK 保持免费，不强制账号或购买。首页采用所有者确认的「双卡对照」，中文标题为「提供付费同步」；Free 提供按访问者系统直接下载及其他系统菜单，Plus 根据卡片内、标题下方 12px 的月付/年付分段控件显示一个主价格：默认 $8.99/月，年付 $79/年；Free 始终 $0，端到端加密同步和内置 AI 权益不随周期变化，不显示「即将推出」标签。年付显示相对连续月付十二个月节省的金额和约整数百分比（当前 $28.88，约 27%），从集中价格计算；月付时隐藏但预留该行，防止切换移位。首页移除平台补充说明、取消续费提示和美元/含税短文案；首页不显示 Free 的「无需账号 · 无需订阅」说明，独立定价页保留；下载下拉中的系统要求及权益勾选标记保持可见。标题左栏与卡片右栏采用和 FAQ 相同的列宽及间距，900px 及以下标题置顶，600px 及以下两卡上下排列；桌面价格、操作和权益分隔线跨语言对齐，外侧边界与其他 Section 一致。浅色 Plus 卡边框为黑色，深色使用主题前景色。「模型费用由服务商另行收取」放入「使用自己的 AI API Key」旁的信息按钮，不再以第二行提示显示。首页和独立定价页共用卡片与五语言费用说明。同步加密不覆盖 AI 推理的说明移到「内置 AI」旁的信息按钮，支持点击/触摸、键盘、外部点击和 Esc 收起，无 JavaScript 时仍可原生展开；不再在卡片下方重复显示。独立五语言 `/pricing/` 保留月年方案及政策详情，月年是同一权益集合的计费周期。首页 Plus 按钮为「立即试用」，链接到本语言 `/pricing/#service-trial` 试用说明；不激活试用或改变未开放快照。
- 首页和独立定价页共用原生 radio 分段控件，支持鼠标、方向键、空格、触摸和无 JavaScript 切换；用主题浮起表面标识选中项、独立 focus-visible 环标识键盘焦点，触摸选项至少 44px 高。切换不移动卡片、不改变 Free 或权益，也不启动购买。所有者选定「卡头分段」，控件直接位于 Plus 卡内；另两个备选「价格旁选择」（下拉）和「双价选项」（并列价格）不进入正式组件。Plus 不再显示标题下的介绍句；Free 简介与 Plus 周期控件共用一行，移除独立简介行和最小高度占位。Free 和 Plus 的价格、CTA 与权益分隔线通过共享行对齐。设计参考 Mobbin 的 [Plain](https://mobbin.com/sites/sections/7e0fc745-3555-4bdf-8792-6aa8b35522ca)（卡片旁独立周期控件）、[folk](https://mobbin.com/sites/sections/f30de5ce-54ed-4daf-befe-d30c53d53ab4)（明确月/年标签）和 [Shade](https://mobbin.com/sites/sections/508ecbc2-f527-4753-b1ce-0230bdf92d38)（控件与价格紧邻）；保留本站左标题、右双卡和纸感主题。
- 受控价格为 USD 8.99/月、USD 79/年；年付明确一次收取 USD 79，网页标价包含依法应收适用税费，不另加这些税费；银行汇兑/跨境费用可独立产生，Apple 当地币种/价格以其确认页为准。原生 radio 和 CSS 支持无 JavaScript 月年切换，不提供促销、积分、AI 次数包、仅同步档或无限容量承诺。
- 计划试用为主动激活、同一账号一次 8×24 小时、免绑卡、不自动扣费。查看、下载和登录不激活。可信支付确认的提前购买立即转付费，剩余试用不补偿；取消、失败和待确认不改变原截止；成功购买后的退款不恢复试用或重新发放。购买、登录、试用不自动上传本地数据或启用 AI。
- Plus 定稿普通保留窗口为全部有效试用、付费和适用宽限结束后 30 天，普通到期/退款/争议相同。取回需要账号和解密材料；截止即关闭，随后 7 天内完成在线删除。截止后新购即使物理清理仍在途也不恢复旧副本；截止前恢复资格可继续使用未删除副本。主动删除不另加 30 天，确认后立即停止相应访问，7 天内在线删除。在线删除后，受限灾难恢复副本可能保留至适用基础设施服务商的保留政策规定的到期时间，不作账号恢复或继续服务入口；基础设施恢复后，必须在恢复访问前重新应用删除记录，不承诺请求时即物理擦除。受限取回和按时清理尚未上线，条款须明确未来生效范围；本地数据/备份与托管 AI 保留规则独立。
- D2 本地实现沿用上述上线政策，公开入口继续关闭。五语言明确受限取回生成独立本地副本，不恢复同步或上传更改；替换当前工作区须明确选择并先做保护性本地备份，登录不能替代设备上的解密材料。未来账号设置显示服务/取回截止及在线删除状态；必要提醒仅在应用内显示服务结束、取回剩余不超过七天、取回截止和已确认在线删除，错过多阶段只显示最新适用阶段，不打断本地编辑、不延长期限，不增加邮件/系统推送。续费失败宽限从原续订截止起算。7 天在线删除及基础设施恢复访问前重新应用删除记录是上线要求。备份到期由适用基础设施服务商的保留政策决定，具体保留方案以后再讨论；不新增每日备份承诺，文案不表示供应商或生产备份/恢复执行已经验证。
- 当前公开下载仍为 1.9.10，未含内置 AI。托管能力以 [hosted-ai.md](hosted-ai.md) 为准；2026-10-23 生产已完成 protocol v2 部署，仍采用 `authenticated` 初期资格。Goalloom 仅在原请求内处理 AI 内容，结果仅返回一次，保留必要调用/费用元数据；历史物理擦除仍未验证。AI 需明确选择和账号同意，经 Goalloom/OpenRouter 至 TypeSafe/Jev（智能输入）、DeepInfra（起草/复盘）或 DeepSeek 官方 1017（笔记重写，可能留存及训练）。官网五语言说明与 scope-v3 客户端告知一致；不承诺全处理方零留存。AI 推理不受同步 E2EE 保护，退出后设备缓存可仍存在。
- Plus 当前 `unavailable`，没有购买、试用激活、Stripe Checkout/Portal 或 App Store 入口，没有可购买的 Plus Offer；现有同步资格不由官网改写。Stripe 账户可收款不代表已有价格或后端。RevenueCat 和 Apple 是后续渠道，iPhone 尚未公开。
- Apple主体阶段已由负责人于2026-10-23确认：先用现有个人会员开发、上架及内购，之后再申请将现有会员转为组织；转换不是当前开发或首次内购的前置条件。网页/Stripe维持Augmenting Human Intellect, LLC，Apple当前卖家按实际个人资料和渠道确认表达；转换批准后再同步主体、协议及相关公开资料，不提前宣称已转换。
- Header 和页脚保留可见的定价入口，手机不隐藏。账单、隐私、删除与账号问题走 `hellojimmywong.ai@gmail.com`；公开 GitHub 只保留技术问题入口。管理说明区分未来 Stripe 原购买渠道与 Apple 订阅，不伪造可用 Portal。
- 定价页 FAQ 分为「常见问题」和「付费相关」两部分。常见问题直接复用首页组件及五语言问答：免费功能、试用、数据安全、退款和支持，标题、简介、答案及私密/技术支持链接完全一致。两组各默认展开首项，组内互斥、组间独立，沿用首页分栏与加减号；900px 及以下上下排列，无 JavaScript 时仍可操作。
- 付费相关部分只补充提前购买、续订与取消、到期数据、周期切换、续费失败和原渠道管理，不重复常见问题中的试用与退款，也不放通用 AI、账号、技术支持或法律链接问答。条款与隐私链接保留在共享页脚。原生回答锚点保持可用，首页及定价卡片「立即试用」仍定位并展开常见问题中的 `#service-trial`；无 JavaScript 时同样有效。计费辅助页的独立支持区保留。
- 独立定价页与首页共用价格卡片组件、字号、权益勾选、下载菜单和卡内周期控件；年付显示同样的总价与节省金额，切换不移动卡片。独立页保留顶部介绍和 FAQ，移除价格卡片下方税费说明及「Plus 尚未开放」提示区；Plus 按钮与首页一致，定位本语言试用 FAQ，不激活试用。Free 卡直接提供已发布桌面安装包及其他系统菜单，手机可复制下载链接。
- 支付政策 v1.0（2026-10-23）已接入五语言，不再把已定条款称为待决策。订阅自动续费；原渠道取消后用至本期结束，取消不等于退款/删除，卸载/退出不等于取消。月年双向更改均在下次续订生效，本期无补差或按比例退款，取消续费后待更改不执行；恢复时确认下期价格/周期。仅已付费自动续费的付款失败享有 3 天完整 Plus 宽限，首次购买失败、试用结束和取消后的正常到期不享有；网页宽限后停止新重试及未来续订，在途付款核对，Apple 可按平台规则继续重试。
- 除适用法律/平台规则另有要求外，付款和未用时间不予退款；重复/错误收费、未按约提供服务通过私密支持处理。试用/即时开通不自动放弃法定撤回权，Apple 退款由 Apple 处理。退款申请本身不停服务；部分退款不缩短有效期，可信全额退款/撤销及已核实争议仅影响对应交易，其他有效来源继续；不自动删除本地数据或复活试用。
- 删除整个账号同时处理网页续费取消，Apple 需独立取消；保留立即删除请求，不要求等订阅到期。仅删除云数据不取消账号/订阅，迟到支付和备份恢复不能重建已删内容。必要订单/发票/支付事实自相关交易或账务调整后保留 7 年（法定更长除外）；假名化试用/防滥用记录删号后最多 180 天，无任务正文和设备指纹，仍按个人数据保护。争议/法定义务只保留必要范围，不能据此保留完整任务库。
- 原购买渠道管理区分 Goalloom 的续费取消/下期周期管理与 Stripe 的付款方式/发票 Portal。存在 schedule 时不能仅送入 Portal 取消；真实动作仍依赖可信后端。AI 仅供个人日常使用，防滥用限制不单独撤销仍有效的同步资格。
- `/billing/continue/` 和 `/billing/return/` 提供五语言静态有限回跳页，显式 noindex/no-referrer 且不入 sitemap。仅 canonical `https://www.goalloom.com` 接收 `v=1&environment=development|production&continue=<UUID>&transport=app|loopback`；生产必须 app 且无 port，开发必须 loopback 并带 1024–65535 的整数 port。拒绝缺参、重复/未知键、非法 UUID、超长输入、环境混配及任何 hash、目标 URL、账号/支付身份或状态声明。输入从地址栏清除且不回显；只保存重建后的有限字段、当前路由类型与本地截止时间至 sessionStorage，最多 24 小时，刷新/切语言/重复原链接不延长。同标识字段冲突、过期和非法输入清除该会话记录；存储不可用或无 JS 时保留手动回 App 核对、下载及私密支持。浏览器期限只是额外限制，不能替代后端原始继续标识期限。
- 用户点击普通链接才打开固定 `goalloom://billing-return?v=1&environment=production&continue=<UUID>` 或开发 `http://127.0.0.1:<port>/billing-return?v=1&environment=development&continue=<UUID>`。网页不 fetch loopback/账单后端、不自动唤起、不接受任意目标、不建立网站 Auth；`goalloom://app` 永不作为回跳目标。通用语言链接保持干净路径，从当前标签页受限会话恢复，不复制原 query/hash。网页只提示回 App 核对原购买，在线、URL 路径、合法标识及回跳均不证明已付、取消或失败；连接检查仅反映浏览器连接提示，不能查付款。应用未打开/断网时允许手动继续，不循环唤起或新建购买。
- 计费回跳页复用 `--edge` 留白变量，仅在本页 Header、正文和页脚设置 `clamp(16px, 3vw, 32px)`，避免 1100px 等小于全站上限的视口贴边；不改变首页、定价或法律页布局。主说明直接提示「返回 Goalloom，使用发起购买的账号查看订阅状态」，五语言同义；原购买/异常恢复说明继续保留。
- 账号绑定、继续标识的原始操作/环境/最长 24 小时服务端有效期、试用、Checkout/Portal、重复订阅防护和权益核对由 BILL-12 桌面/可信后端所有。D1 官网有限回跳不等同于公开购买已连接；渠道价格、政策、公开客户端、生产生命周期验收及收费授权齐备后再开放入口。不在静态站建立 Webhook、SSR/API 或平行权益计算器。本地 E2E 只受控拦截 canonical 页面，不扩大后端 CORS/允许 host；开发提供商联通可仅将 canonical 静态资源拦截至审阅后的本地导出，Stripe Test、Auth/后端和原生 loopback 保持真实；须明确记录未部署公网及未验收打包协议处理器。生产域名与公开发布另行验收。

## 工程契约

- `apps/website/` 是独立 pnpm 根（自带 `pnpm-workspace.yaml`），Next.js 静态导出；Vercel 项目 Root Directory = `apps/website`，依赖不得进入根目录 Electron 的 `node_modules`。
- 单一事实来源：站点地址 `apps/website/lib/seo/site.ts`（`scripts/audit-seo.mjs` 与 `scripts/e2e.mjs` 各保留一份同值常量，改域名三处同改）；下载版本与资产名 `apps/website/lib/release.ts`；看板演示规则 `apps/website/lib/board.ts`（筛选点亮、悬停链、跨级虚线，与 `relation-lines.md` 一致）；文案 `apps/website/lib/i18n/catalogs/*`（`en.ts` 定义结构，其余语言由类型强制对齐）。
- 服务事实由 `lib/services/release.ts` 集中管理，`types.ts` 约束五语言 copy；`lib/legal/service-policy.ts` 按稳定章节 ID 合入当期政策，保留许可证段落。未来页面价格不能代替后端 Price 校验。
- `lib/seo/routes.json` 为路由清单：四类公开页×五语言共 20 个可索引地址，两个计费壳×五语言共 10 个 noindex 地址。sitemap 与构建审计共用清单；审计按路由类型检查，不把所有非首页当作法律页。
- 主题与平台在 `<head>` 内联脚本中于首帧前决定（`components/boot.ts`），不得挪进 `"use client"` 模块。
- 构建门禁：`pnpm build` 之后运行 SEO 审计，逐页解析标签属性（托管方可能重排属性），要求 html lang、自指 canonical、互指 hreflang（含 x-default）、description、og:image、JSON-LD，以及 sitemap、robots、社交图存在。
- 生产域名为 `https://www.goalloom.com`，`goalloom.com` 由 Vercel 308 跳转；canonical、hreflang、sitemap、og 一律使用 www。

## TODO

- [x] Restore sticky privacy/terms headers, keep contents and anchor targets below the header, and remove the standalone Plus policy banner in all five locales. Website typecheck, build/30-route SEO and legal/policy E2E 22/22 passed; desktop/mobile themes and no-JavaScript navigation are verified.

- [x] Unify the entire site including Hero at 1296px, remove only the homepage Free billing note, halve homepage pricing/FAQ vertical padding and tighten the shared price-to-action gap. Website typecheck, build/30-route SEO and website E2E 119/119 passed; localized route frames, themes, mobile layouts and pricing alignment are verified.

- [x] Align the maker note to the video top and match the video column edges/width to pricing and FAQ. Website typecheck, build/30-route SEO and video-intro E2E 9/9 passed across five languages and 320–2560px.

- [x] Revise the homepage FAQ to free features, trial, security, refunds and inline prose support. Reuse finalized policy answers by stable id and update all five locales. Website typecheck, build/30-route SEO and FAQ E2E 8/8 passed.

- [x] Move the BYOK provider-fee note into the shared inline information disclosure, with localized accessible labels and keyboard/touch/no-JS acceptance. Typecheck, build/30-route SEO and service coverage passed across the feature run and isolated mobile replay.

- [x] Curate the homepage FAQ to five product questions plus a final native support disclosure. Rename the free-features question in all five locales; remove the three owner-specified questions and standalone support area. Website typecheck, build/30-route SEO and FAQ E2E 8/8 passed.

- [x] Apply the approved quiet-screening maker/video design: one continuous regular-weight paragraph at 1.7 leading, original avatar, inverse cover and no exterior caption/duration. Localized video-intro acceptance passed; see the 2026-10-23 quiet-screening record below.

- [x] Split pricing FAQ into the homepage common FAQ and six additional billing questions. Reuse the same common component, questions, answers and support links in all five languages; keep trial/refunds there without duplication, use independent disclosure groups and retain native trial/refund anchors. Website `pnpm typecheck`, `pnpm build`/30-route SEO, `pnpm test:e2e --no-build --only=services` 33/33 and `--only=faq` 8/8 passed. Evidence: `apps/website/output/tests/services/report.json`, `pricing-zh-desktop.png`, `pricing-common-faq-zh-support.png` and `apps/website/output/tests/faq/report.json`. Scope: macOS arm64, Node 24.21.0, Chromium 153.0.8010.12 static website; no deployment or desktop acceptance.

- [x] Remove the pricing-page tax, bank-fee and Apple-price caption in all five languages and delete its unused catalog field/style. Website `pnpm typecheck`, `pnpm build`/30-route SEO and `pnpm test:e2e --no-build --only=services` 33/33 passed. Five exported pricing pages also passed `node output/tests/pricing-copy-removal/check.mjs`; evidence: `apps/website/output/tests/pricing-copy-removal/report.json` and `apps/website/output/tests/services/report.json`. Scope: macOS arm64, Node 24.21.0, Chromium 153.0.8010.12 static website; no deployment or desktop tests.

- [x] Share PricingPlans between homepage and pricing, including in-card billing, annual savings, benefit checks, download menus and information disclosures. Remove the pricing availability notice and link its Plus action to the existing trial FAQ. Website `pnpm typecheck` and `pnpm build`/30-route SEO passed; services 32/33 plus the isolated owning mobile replay passed, FAQ 8/8 and download 5/5 passed. The failed mobile check followed an oversized screenshot that changed Chromium touch emulation; viewport evidence capture resolved that test-harness issue. Commands, measured targets, initial failure and replay evidence: `apps/website/output/tests/pricing-shared/acceptance.json`. Price/layout screenshots: `apps/website/output/tests/services/pricing-cards-zh-*.png`. Scope: macOS 26.4.1 arm64, Node 24.21.0, Chromium 153.0.8010.12 static website; installer requests used controlled fixtures, no deployment or desktop acceptance.

- [x] Consolidate the seven standalone trial, purchase, AI, expiry, renewal, grace and refund explanations into existing FAQ answers in all five languages. Remove the duplicate content fields and two-column sections; retain native answer fragments that reveal the trial explanation with or without JavaScript. Website `pnpm typecheck`, `pnpm build`/30-route SEO, `pnpm test:e2e --no-build --only=services` 33/33 and `--only=faq` 8/8 passed. Evidence: `apps/website/output/tests/services/`, `apps/website/output/tests/faq/` and `apps/website/output/tests/pricing-faq-followup/`. Initial no-JS pointer checks conflicted with native fragment/focus scrolling; the focused five-language check verified scroll completion and native keyboard navigation before the final suite passed. Scope: macOS 26.4.1 arm64, Node 24.21.0, Chromium 153.0.8010.12 static website; no deployment or desktop acceptance.

- [x] Move pricing support, original-channel management and legal links into three localized FAQ answers. Share the homepage disclosure component and split layout. Website typecheck, build/30-route SEO, services/policy 33/33 and homepage FAQ 8/8 E2E checks passed. Evidence: `apps/website/output/tests/services/` and `apps/website/output/tests/faq/`; macOS 26.4.1 arm64, Node 24.21.0, Chromium static website only. The initial touch-navigation assertion ran before navigation completed; explicit URL waiting fixed the test. No deployment or desktop acceptance.

- [x] Restore the original five-language ADHD maker note and Jimmy avatar on the left, remove all scene buttons/illustrations, and retain the video on the right. Remove only the homepage FAQ list outer rules and keep inner separators. Website typecheck, build/30-route SEO, video 9/9 and FAQ 8/8 E2E checks passed.

- [x] Merge the video, relation illustration and AI film into one FAQ-aligned introduction. Use three native scene buttons below the left title, stable right-panel geometry and selected-only media; remove duplicate feature sections. Website typecheck, build/30-route SEO and 12/12 product-tour E2E checks passed.

- [x] Remove the repository-review Todo and its preview/connector from all Hero scenes and the mirrored phone. Keep the remaining child task and local website link. Website typecheck, build/30-route SEO and 15/15 targeted Hero E2E checks passed; the shared interactive cases now have a hero-demo selector.

- [x] Tighten the Plus header: remove its redundant description in every locale, place the billing selector 12px below the title, and share the Free-description/Plus-selector row to preserve price/action/benefit alignment. Website typecheck, build/30-route SEO and 25/25 pricing/service E2E checks passed.

- [x] Apply the approved in-card segmented billing control: align Free/Plus price, action and benefit rows; retain Hugeicons checks; remove platform/cancellation/tax captions; calculate annual savings from twelve monthly payments; use localized trial-information CTAs. Website typecheck, build/30-route SEO and 25/25 pricing/service E2E checks passed.

- [x] Implement the approved homepage dual-card pricing: paid-sync heading in five languages, Free platform downloads, centralized monthly Plus price, encrypted sync/built-in AI benefits and black light-theme Plus borders. Website typecheck, build/30-route SEO and 102/102 Chromium E2E checks passed.

- [x] Implement the approved split FAQ: localized title/intro on the left, native exclusive questions on the right, first answer open, plus/minus indicators and private/technical support below. Keep all eight current answers, stack on phones, and move download/copy access into Header. Website typecheck, build/30-route SEO and 97/97 Chromium E2E checks passed.

- [x] Share a split download button across Header and the download section: direct platform link on the left, alternate installer disclosure on the right, five-language labels, shared language/download dismissal, compact mobile layout and native no-JavaScript links. Website typecheck, build/30-route SEO and 89/89 Chromium E2E checks passed.

- [x] Dismiss shared language menus on outside mouse/touch input without blocking the clicked control; keep inside padding open and restore trigger focus on Escape. Hero/header/footer and five-language mobile checks passed, with native no-JavaScript links retained.

- [x] Match the personal website’s button-centered circular theme reveal: native view transitions, 550ms ease-in-out in both directions, retained auto/persistence policy, immediate keyboard/reduced-motion/capability fallbacks and interruption cleanup. Website typecheck, static build/30-route SEO and 81/81 Chromium E2E checks passed. Native midpoint captures and timing/origin evidence: `apps/website/output/tests/e2e/theme-motion.json` and `theme-circle-*.png`.

- [x] Move homepage language/theme controls into the Hero macOS status bar before the clock; retain header controls on information pages. Typecheck, static build/30-route SEO and 74/74 website E2E checks passed, including keyboard selection, live language navigation, persisted themes, five-language 320/390px touch layouts and no-JavaScript language menus. Screenshots: `apps/website/output/tests/e2e/hero-menubar-{language,mobile}.png`.

- [x] Integrate finalized billing policy v1.0 in all five languages: inclusive tax, period-end cancellation and cycle changes, eligible three-day renewal grace, no trial restoration after refunds, and separate cloud/deletion/backup/record windows. Typecheck, static build/30-route SEO and 72/72 website E2E checks passed, including seven new policy journeys and stable no-JS anchors. Policy approval keeps purchases closed pending provider/backend/lifecycle delivery.

- [x] Add five-language planned pricing, home service summary, private support, current account/hosted-AI/payment policy amendments and sealed billing shells. Website typecheck, static build with 20 indexable/10 noindex routes, and 65/65 headless Chromium E2E checks passed. In that initial batch, final policy text, BILL-12 account-bound workflows and provider lifecycle were still dependencies; policy text was integrated in the subsequent v1.0 batch. No deployment or purchase was performed.

- [x] Default the Hero to relation lines, keep only relation-line/smart-input tabs and align the demo with current product rows, URL previews and two-level to-dos. Typecheck, build/15-page SEO audit and 46 website E2E checks passed: all five locales, independent completion, keyboard navigation, growing rows and mobile/dark layouts. Measured 9 connectors at 1440px with zero endpoint error; resize evidence is in `apps/website/output/tests/e2e/hero-geometry-{1024,1440}.json`.
- [x] Add the encrypted-sync Hero scene with a lower-right mobile preview, shared Today state, keyboard navigation and a narrow-screen single-board fallback. Keep relation lines as the default and label the mobile concept as a preview.
- [x] Refine the sync scene with interruptible enter/exit motion, remove visible preview/encryption labels and preserve the Add button's normal inset with readable Today columns.
- [x] Replace the maker quote with the approved refined split video introduction, localized typographic cover and bundled click-to-play silent tour; preserve native no-JavaScript access and media failure recovery.
- [x] Remove the homepage Plus coming-soon badge and display the centralized $79 annual option alongside $8.99 monthly, with billing copy shared by both cycles.
- [x] Add a reference-informed monthly/yearly segmented control shared by homepage and pricing page; show only the selected $8.99/month or $79/year price, with native keyboard/touch/no-JavaScript support and stable card layout.

- [x] Cap the website at 1440px, show one sticky header from first paint and replace the shrinking hero with a static full-width desktop. Typecheck, static build/15-page SEO audit and 43 website E2E checks passed, including desktop/ultrawide/mobile layouts, no-JavaScript navigation and existing website journeys.

- [x] Published the 1.9.10 download snapshot and five-language manual-upgrade copy after the GitHub Release became public. Website typecheck, static build/15-page SEO audit and 41 E2E checks passed. The prepared deployment was promoted after publication; all 15 live pages, all five homepages' 1.9.10 links and both public installer responses passed verification. See the [release timing record](../releases/v1.9.10-timing.md).

- [x] Published the 1.9.9 download snapshot after the GitHub Release became public. Website typecheck, build/15-page SEO audit and 41 E2E checks passed. A production build was prepared without changing the public domain, then promoted after release publication. Browser checks passed for all 15 live pages, all five homepages' 1.9.9 links and both public downloads.

- [x] Published the 1.9.8 download snapshot after the GitHub Release became public. Website typecheck, build/15-page SEO audit and 41 E2E checks passed. Vercel production deployment and browser checks of all 15 live pages passed; all five homepages link to 1.9.8.

- [x] 上线五语言隐私政策和服务条款，提供公开静态地址、双端页脚入口、保留文档的语言切换、目录与联系邮箱；同步页面元数据及 sitemap，不改变既有开源许可。

- [x] Published the 1.9.7 download snapshot after the GitHub Release became public. Website typecheck, build/SEO audit and 27 E2E checks passed. Vercel production deployment and all five live pages, canonical/hreflang metadata and 1.9.7 download links passed verification.

- [x] Published the 1.9.6 download snapshot after the GitHub Release became public. Website typecheck, build/SEO audit and 27 E2E checks passed. Vercel production deployment and all five live pages, canonical/hreflang metadata and 1.9.6 download links passed verification.

- [x] Pointed all five website locales and the older Mac manual-upgrade instructions to public Release 1.9.5. Vercel production deployment, five-language pages, canonical/hreflang metadata and live download links passed verification.
- [x] 官网首版：五语言静态站、可操作首屏、关系线轮播、Jev 动图、明暗主题、平台感知下载、窄屏布局、滚动动效。
- [x] 部署 Vercel 并绑定 www.goalloom.com；Search Console 提交 `https://www.goalloom.com/sitemap.xml`。
- [ ] 首屏壁纸补 2880px 宽的高清版本（现为 1586px）。
- [x] 发布公开 Release 1.1.0 并更新 `apps/website/lib/release.ts`（版本、资产名、`published: true`）。
- [x] 发布公开 Release 1.2.0 并将 `apps/website/lib/release.ts` 指向 1.2.0 资产。
- [x] 发布公开 Release 1.3.0 并将 `apps/website/lib/release.ts` 指向 1.3.0 资产。
- [x] 发布公开 Release 1.4.0 并将 `apps/website/lib/release.ts` 指向 1.4.0 资产。
- [x] 发布公开 Release 1.5.0 并将 `apps/website/lib/release.ts` 指向 1.5.0 资产。
- [x] 发布公开 Release 1.6.0 并将 `apps/website/lib/release.ts` 指向 1.6.0 资产。
- [x] 发布公开 Release 1.9.0，将下载指向 1.9.0，并更新五语言的同步、Apple 公证及公开版 macOS 1.8.0 手动升级说明。
- [x] 发布公开 Release 1.9.1，将五语言下载与旧版 Mac 手动升级说明指向 1.9.1。
- [x] 发布公开 Release 1.9.2，将五语言下载与旧版 Mac 手动升级说明指向 1.9.2。
- [x] 发布公开 Release 1.9.3，将五语言下载与旧版 Mac 手动升级说明指向 1.9.3。
- [x] 将五语言下载与旧版 Mac 手动升级说明指向公开 Release 1.9.4，完成 Vercel 生产部署与线上核对。

## 验收

- [x] 2026-10-25 Owner-confirmed contact update: `SERVICE.supportEmail` is `hellojimmywong.ai@gmail.com` across all five locales, including pricing, billing/refund/deletion support, FAQ, footer, privacy and terms. Website `pnpm typecheck`, `pnpm build` / 30-page SEO, and mapped `services` 40/40, `legal` 22/22 and `faq` 8/8 E2E passed. Each selector ran once; services/legal include their existing shared policy coverage. Fresh `--output-prefix` evidence preserves previous reports and rejects reuse. All 30 exported pages use the new contact and omit the old one. The ten policy catalogs, commercial values beyond contact, closed launch gates and public 1.9.10 download snapshot are unchanged. Logs, reports, screenshots, source/build hashes and a reviewable static export are under `apps/website/output/tests/support-email-20261025-e52c48/`. Scope: macOS 26.4.1 arm64, Node v24.21.0, pnpm 11.9.0, Playwright 1.63.0 / Chromium static website; physical/VM status not established. No deployment, provider configuration, desktop/full-site/stress or packaged acceptance was performed.

- [x] 2026-10-23 D1 BILL-12 finite website handoff: exact canonical fields/environment pairing, scrubbed input, session-only locale/reload recovery capped at 24 hours, fixed user-click app/development-loopback navigation, manual recovery and no-referrer metadata. Website `pnpm typecheck`, `pnpm build`/30-route SEO and `pnpm test:e2e --no-build --only=services` passed, 40/40; billing-only feedback run passed 7/7 after fixing fragment-only input handling (initial 6/7 retained). Coverage includes ten routes, five languages, duplicate/unknown/mixed/overlong inputs, session conflicts/expiry, keyboard/focus, 320px dark touch, offline, denied storage and no JavaScript. Reports/screenshots: `apps/website/output/tests/billing/` and `apps/website/output/tests/services/`; archived evidence and reviewable static export: `output/tests/billing/desktop/d1-website/`. Scope: macOS 26.4.1 arm64, Node 24.21.0, pnpm 11.9.0, Playwright 1.63.0 / Chromium 153.0.8010.12; physical/VM status not independently checked. Canonical browser requests were intercepted to local static files. No backend/provider requests, native scheme invocation, Electron/SQLite/Windows/package acceptance, model calls or deployment. Real development provider return may use only reviewed canonical static-resource interception, with actual backend/provider/native reconciliation; public-domain deployment and packaged protocol registration remain separate acceptance. Public purchase and trial activation remain closed.

- [x] 2026-10-23 Restored privacy/terms Header stickiness by removing the legal-page position override. Desktop contents now stay 24px below the Header and fit the remaining viewport; section anchors use the same Header-aware offset. Removed the standalone Plus notice, its style and all five unused catalog fields. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=legal` passed, 22/22. The first scoped run was 21/22: a no-JS footer cross-link click timed out with an outside-viewport target; explicit driver positioning before that click resolved the replay without changing product scrolling or global timeouts. Evidence: `apps/website/output/tests/legal/report.json`, `sticky-navigation.json` (38 layout samples, all Header tops at 0), `legal-privacy-sticky.png`, `legal-terms-sticky-phone-dark.png`; initial report retained at `apps/website/output/tests/legal-replay/initial-report.json`. Scope: static website on macOS 26.4.1 arm64, Node 24.21.0, Playwright 1.63.0 / Chromium 153.0.8010.12; no deployment or desktop tests.


- [x] 2026-10-23 Unified Header, Hero, content and footer at 1296px across all 30 routes and both themes. Removed only the homepage Free billing note, halved homepage pricing/FAQ padding and reduced the shared pricing billing-row spacing from approximately 54px to 32px while retaining annual savings and aligned actions. Fixed native fragment alignment by excluding the target section from entrance translation; corrected the English heading assertion to read source text rather than CSS-uppercase innerText. Initial website run was 117/119; after the fixes and final width/spacing changes, `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build` passed, 119/119. Evidence: `apps/website/output/tests/e2e/report.json`, `site-width.json`, `home-pricing-zh-1440.png`, `home-pricing-zh-yearly.png` and `desktop-sticky-navigation.png`. Scope: static website on macOS 26.4.1 arm64, Node 24.21.0, Playwright 1.63.0 / Chromium 153.0.8010.12; no deployment or desktop tests.


- [x] 2026-10-23 Aligned the maker note and video at their top edges. The introduction now matches pricing/FAQ grid columns (minmax(200px,.3fr)/1fr) and 80px spacing, so the video shares both horizontal edges and width with their right-side content. Kept the existing continuous copy, cover, mobile stack and playback behavior. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=video-intro` passed, 9/9. Five-language alignment checks cover 320/390/800/1024/1440/2560px in light/dark themes; measured column-edge/width and desktop-top deltas are zero. Existing playback, keyboard/touch, offscreen pause, replay, failure retry and no-JS checks also passed. Evidence: `apps/website/output/tests/video-intro/report.json`, `video-intro.json`, `video-intro-zh-desktop.png` and `video-intro-zh-phone-dark.png`. Scope: static website on macOS 26.4.1 arm64 / Node 24.21.0 / Chromium 153.0.8010.12; other sections served as read-only alignment references, with no unrelated suites, desktop tests or deployment.

- [x] 2026-10-23 Revised the homepage FAQ to five questions: free features, trial, data security, refunds and further support. Removed the Todo comparison, Jev and installation questions. Free/trial/refund answers now reuse finalized service facts by stable ID directly in the server FAQ component; the site catalog no longer composes service facts by array index. Security copy distinguishes local storage/backups, encrypted sync payloads, operational metadata and readable AI context; it does not promise that all data is invisible to all processors. Support links are part of a complete localized paragraph, with no action row or icons. `cd apps/website && pnpm typecheck`, `pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=faq` passed, 8/8. The first FAQ run passed 6/8 because an English-only AI-acronym assertion rejected Spanish/French IA; corrected that assertion and reran the smallest supported FAQ suite successfully, without changing product copy. An initial root-level `pnpm typecheck` also ran desktop typecheck and passed; it was not used as website acceptance. Coverage includes exact question order, parity with finalized pricing policy text, resolved eight-day/192-hour trial values, inline support semantics, keyboard/touch, 320/390px light/dark layouts, no-JS and existing pricing downloads. Evidence: `apps/website/output/tests/faq/report.json`, `faq-split.json`, `faq-support-zh-desktop.png`, `faq-security-zh-desktop.png` and `faq-split-zh-phone-dark.png`. Scope: static website on macOS 26.4.1 arm64 / Node 24.21.0 / Chromium 153.0.8010.12; no desktop E2E, provider actions or deployment.

- [x] 2026-10-23 Moved the BYOK model-provider fee note into an information button beside the API-key benefit in shared homepage/pricing cards. Removed the separate small-text row and added accessible labels in all five locales, reusing InfoDisclosure and its existing dismissal behavior. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) passed. `pnpm test:e2e --no-build --only=services` passed 32/33; the added mobile check observed the screenshot changing coarse-pointer emulation before measuring the next icon. Both controls measured 44×44 with coarse input. Moved screenshot capture after both control checks, then replayed only that failed original scenario with `node output/tests/byok-info/replay-mobile.mjs`; it passed. Coverage includes both card placements, five languages, desktop keyboard/Escape/outside click, stable card height, mobile touch/panel bounds, no-JS and the existing service/policy checks. Evidence: `apps/website/output/tests/byok-info/acceptance.json`, `mobile-report.json`, `home-pricing-free-info-zh-phone-dark.png` and `apps/website/output/tests/services/home-pricing-byok-info-zh.png`. Scope: static website on macOS 26.4.1 arm64 / Node 24.21.0 / Chromium 153.0.8010.12; no desktop tests, provider operations or deployment.

- [x] 2026-10-23 Homepage FAQ now contains five product questions and a final collapsed support question. Removed the iPhone, account/sync-password/payment and supported-system questions, renamed the first question to “哪些功能免费使用？” with five-language equivalents, retained shared current free-feature facts, and moved private/technical support links inside the final native exclusive answer. Removed the standalone support area and its unused styles. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=faq` passed, 8/8. Coverage includes the exact six-question order in all five locales, default/exclusive disclosure, keyboard/touch support, internal-only separators, 320/390px light/dark layouts, no-JS access and existing download navigation/copy feedback. Evidence: `apps/website/output/tests/faq/report.json`, `faq-split.json`, `faq-split-zh-desktop.png`, `faq-support-zh-desktop.png` and `faq-split-zh-phone-dark.png`. Scope: static website on macOS 26.4.1 arm64, Node 24.21.0, Playwright 1.63.0 / Chromium 153.0.8010.12; unrelated website suites, desktop tests and deployment were outside this change.

- [x] 2026-10-23 Applied the approved quiet-screening design with the owner’s final typography adjustment: the original maker text is one continuous 17px/1.7 regular-weight paragraph, with Jimmy’s local avatar. The inverse-theme cover has a localized text play action; the external caption/duration are absent, and the reset stays inside the player without changing section height. Updated all five locales and module contracts. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=video-intro` passed, 9/9. Coverage includes five locales at 320/390/800/1024/1440px in both themes, original text/avatar, inverse colors, no passive media requests, native playback/offscreen pause/replay, keyboard/touch, error retry and no-JS access. Evidence: `apps/website/output/tests/video-intro/report.json`, `video-intro.json`, `video-intro-zh-desktop.png`, `video-intro-zh-phone-dark.png` and `video-intro-playing.png`. Local `http://127.0.0.1:3000/zh-CN/` returned 200. Scope: static website on macOS 26.4.1 arm64, Node 24.21.0, Playwright 1.63.0 / Chromium 153.0.8010.12; unrelated website suites, desktop tests and deployment were outside this change.

- [x] 2026-10-23 Restored the original five-language ADHD maker note, emphasis, local Jimmy avatar and author link beside the unchanged native video; removed the three scene controls and body illustrations. The homepage FAQ list now has no top or bottom rule, with all seven inner separators retained. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO), `pnpm test:e2e --no-build --only=video-intro` (9/9) and `pnpm test:e2e --no-build --only=faq` (8/8) passed. Coverage includes five languages, 320/390/800/1440px in both themes, note/avatar loading, FAQ alignment and border geometry, native playback/pause/retry, disclosures, keyboard/touch, no-JS and download access. Evidence: `apps/website/output/tests/video-intro/report.json`, `video-intro-zh-desktop.png`, `video-intro-zh-phone-dark.png`; `apps/website/output/tests/faq/report.json`, `faq-split.json`, `faq-split-zh-desktop.png`. Scope: static website on macOS arm64 / Node 24.21.0 / Chromium 153.0.8010.12; no unrelated website suites, desktop tests or deployment.

- [x] 2026-10-23 ProductTour now shares the FAQ columns, 36px desktop title and 900px stacking breakpoint. Three native radio buttons select the video, fixed goal-chain illustration or AI film; duplicate feature sections and unused carousel styles/hook are removed. Shared grid sizing keeps the pricing section still. Video pauses on deselection; the AI film runs only while selected and visible, with a complete reduced-motion/no-JS suggestion. Five-language copy and module contracts are updated. `cd apps/website && pnpm typecheck && pnpm build` (30-route SEO) and `pnpm test:e2e --no-build --only=video-intro` passed, 12/12. Coverage: FAQ column alignment, five locales at 320/390/800/1440px in both themes, stable geometry, keyboard/touch selection, real video playback/pause/retry, AI playback and dynamic reduced motion, and no-JS selection/playback. No passive video or third-party requests. Local homepage returned 200. Evidence: `apps/website/output/tests/video-intro/report.json`, `video-intro.json`, `product-tour-{video,lines,ai}-desktop.png`, `product-tour-{lines,ai}-phone-dark.png`, `product-tour-ai-created.png`. Scope: static website on macOS arm64 / Node 24.21.0 / Chromium 153.0.8010.12; no unrelated website suites, desktop tests or deployment.

- [x] 2026-10-23 Hero 移除「核对关系线与任务缩进」（d7）及仓库预览/连线；桌面场景、手机镜像和无 JS 首屏一致。将既有 Hero 交互验收提取为共享用例，新增 `--only=hero-demo` 以单独覆盖看板交互与同步场景；原缩进和 URL 验收分别使用剩余 d8 与 w1，后续关系线案例数据不变。`cd apps/website && pnpm typecheck && pnpm build` / 30 页 SEO、`pnpm test:e2e --no-build --only=hero-demo` 通过，15/15。覆盖筛选/悬停链、完成/新建/撤销、24px 缩进、URL 本地预览/受控外链、实测连线、五语言明暗桌面/手机、同步动画、无 JS 与移除回归。报告和截图：`apps/website/output/tests/hero-demo/report.json`、`desktop-hero-filter.png`、`hero-sync-zh-desktop.png`、`hero-sync-zh-phone-dark.png`。运行范围为 macOS arm64 / Node 24.21.0 / Chromium 153.0.8010.12 的静态官网；未运行其他官网模块或桌面测试，未部署。

- [x] 2026-10-23 Plus 卡移除标题下的介绍句，周期控件距标题 12px；将 Free 简介与 Plus 控件并入同一共享行，删除独立占位行，保留价格、按钮和权益线对齐。清理五语言废弃文案和类型字段。`cd apps/website && pnpm typecheck && pnpm build` / 30 页 SEO、`pnpm test:e2e --no-build --only=services` 通过，25/25。新增五语言 1440/1024/768px 和 320/390px 明暗触摸的标题间距、介绍句不存在回归；既有年付节省、价格对齐、键盘/无 JS 和关闭计费场景均通过。可复跑证据：`apps/website/output/tests/services/report.json`、`home-pricing-zh-yearly.png`、`home-pricing-zh-{1440,1024,768}.png`、`home-pricing-cycle-phone-{light,dark}.png`。运行范围为 macOS arm64 / Node 24.21.0 / Chromium 153.0.8010.12 的静态官网，未运行桌面测试或部署。

- [x] 2026-10-23 按确认的「卡头分段」将周期控件移入 Plus，使用显式共享网格行对齐两卡价格、按钮和权益线；保留蓝色 Hugeicons 勾选标记。首页移除平台、取消续费和美元/含税补充文字；年付显示省 $28.88（约 27%），金额和百分比从集中价格计算，切换保留行高。五语言 CTA 改为「立即试用」并到达本语言试用说明，不激活试用。`cd apps/website && pnpm typecheck`、`pnpm build` / 30 页 SEO 审计、`pnpm test:e2e --no-build --only=services` 通过，25/25。覆盖五语言 1440/1024/768px 价格与按钮对齐、卡片高度稳定、方向键/空格、320/390px 明暗触摸、年付节省、实际试用锚点、信息弹层与无 JavaScript；定价/计费关闭状态保持通过。首轮修正了路径工具移除 hash 的用法，并从截图纠正 subgrid 自动排位，最终当前源码专项通过。重复证据：`apps/website/output/tests/services/report.json`、`home-pricing-zh-yearly.png`、`home-pricing-zh-{1440,1024,768}.png`、`home-pricing-cycle-phone-{light,dark}.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Chromium 153.0.8010.12 的静态官网；未运行无关官网模块或桌面测试，未部署。

- [x] 2026-10-23 首页价格改为月付/年付分段切换，默认 $8.99/月，年付显示完整 $79/年；控件在左侧说明下方，选项使用本站主题浮起表面，Free 与权益不变。参考 Plain/folk/Shade 的周期控件布局（来源见本页产品规则），首页和独立定价页复用 `billing-cycle.tsx` 原生 radio，价格由 CSS 跟随选中项。`cd apps/website && pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build --only=services` 通过，25/25。覆盖五语言 1440/1024/768px 切换与卡片文档坐标/高度稳定、方向键/空格、320/390px 明暗与至少 44px 触摸区域、两页无 JavaScript 切换、Free 下载与关闭的计费状态。首次稳定性断言改为文档坐标，避免将浏览器滚动到控件误判为卡片位移；最终当前源码专项通过。本地首页返回 200 并包含新控件。重复证据：`apps/website/output/tests/services/report.json`、`home-pricing-zh-yearly.png`、`home-pricing-zh-1440.png` 和 `home-pricing-cycle-phone-{light,dark}.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Chromium 153.0.8010.12 的静态官网；未运行其他官网模块或桌面测试，未部署。

- [x] 2026-10-23 首页 Plus 移除「即将推出」标签，保留 $8.99/月并补上 $79/年，金额均来自 SERVICE 快照；五语言税费说明去掉仅按月收费的限定，月年价格同时可见。`cd apps/website && pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build --only=services` 通过，定价/服务专项 24/24。覆盖五语言 1440/1024/768px 双卡价格/按钮/权益线对齐、390px 深色手机、无 JavaScript 年价可见、独立定价月年切换、信息弹层/Free 下载及关闭的计费状态。证据在 `apps/website/output/tests/services/`：`report.json`、`home-pricing-zh-{1440,1024,768,phone-dark}.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Chromium 153.0.8010.12 的静态官网；未运行其他官网模块或桌面测试，未部署。

- [x] 2026-10-23 按确认的「文案与视频分栏」精修版替换 Hero 下方作者寄语，沿用预览中的 10.4 秒静音片段，更新五语言与模块地图。`cd apps/website && pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build` 通过，117/117；专项命令 `pnpm test:e2e --no-build --only=video-intro` 为 9/9，提供独立复跑入口。覆盖 1440/800/390/320px 五语言明暗、26px 标题/680px 封面/12px 圆角/外侧边界、无被动媒体下载与外部请求、真实 H.264 播放、原生控制、离屏暂停、键盘返回/重播、失败重试和无 JavaScript 展开/播放/收起。首轮修正了原生控件验收的操作/等待方式，并从截图修正圆角继承问题；之后专项和当前源码完整回归通过。本地 `http://127.0.0.1:3000/zh-CN/` 返回 200 且包含新组件与视频地址，旧寄语已不存在。证据：`apps/website/output/tests/e2e/report.json`、`video-intro.json`、`video-intro-zh-desktop.png`、`video-intro-zh-phone-dark.png`、`video-intro-playing.png`、`video-intro-error.png`；专项产物另存 `apps/website/output/tests/video-intro/`。运行范围为 macOS 26.4.1 arm64、Node 24.21.0、Chromium 153.0.8010.12 的静态官网；未运行桌面测试或部署。

- [x] 2026-10-23 同步场景打磨：手机原生 CSS 进场 280ms、退场 180ms，可中断；键盘/减少动态效果立即切换。五语言可见预览/加密状态文案移除；Add 恢复看板右下角 24px 内缩，按视口聚焦三列或两列，今天保持至少 320px 并完整可见。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计通过；首轮官网完整回归 `pnpm test:e2e --no-build` 为 108/108，最后列构图调整后运行 `pnpm test:e2e --no-build --only=hero-sync`，专项 6/6。覆盖原生过渡中间帧、快速反向、动态启用减少动效、键盘、五语言 1024/1440px 明暗与 320/390px 触摸、Add 命中/内缩、共享状态与无 JavaScript 首屏。当前证据在 `apps/website/output/tests/hero-sync/`：`report.json`、`hero-sync.json`、`hero-sync-transition.webm`、`hero-sync-{enter,exit}-midpoint.png` 与明暗布局截图；完整回归报告在 `apps/website/output/tests/e2e/report.json`。运行范围为 macOS 26.4.1 arm64、Node 24.21.0、Chromium 153.0.8010.12 的静态官网；未运行桌面或真实同步验收，未部署。

- [x] 2026-10-23 Hero 增加「端到端同步」场景：桌面看板右下角叠放只读手机，复用今天任务及完成、新建、撤销状态；五语言标注移动端预览与端到端加密同步，窄屏显示单列和同步提示。`cd apps/website && pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build` 通过，107/107。新增 5 个场景验收覆盖键盘循环/Home/End、主要控件不遮挡、1024/1440px 与 320/390px 明暗/触摸、无 JavaScript 默认关系线及零外部请求；首次检查发现法语 320px 长标签溢出，调整换行后复跑通过。可重复证据：`apps/website/output/tests/e2e/report.json`、`hero-sync.json`、`hero-sync-zh-desktop.png`、`hero-sync-zh-desktop-dark.png` 和 `hero-sync-zh-phone-dark.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 的 Chromium 静态官网；这是本地状态演示，未验证真实同步服务、移动端发布或桌面客户端，未部署。

- [x] 2026-10-23 Hero composer 隐藏全局/列头加号的底部说明，各语言共用该显示设置。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计及 `pnpm test:e2e --no-build` 通过，102/102；既有 Hero 新建/撤销场景增加说明节点不存在的断言，创建、撤销、关闭与手机布局保持通过。报告与截图：`apps/website/output/tests/e2e/report.json`、`desktop-hero-composer.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0 的 Chromium 静态官网；未部署或运行桌面测试。

- [x] 2026-10-23 首页价格调整为左标题、右双卡，桌面列宽/间距与 FAQ 一致；加密边界提示改为「内置 AI」旁的原生信息按钮。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build` 通过，102/102。覆盖五语言 1440/1024px 与 FAQ 对齐、768px 标题置顶、390px 深色弹层边界与 44px 触摸区域、点击/Enter/Esc/外部收起、无 JavaScript 展开，以及既有下载和 FAQ。产物：`apps/website/output/tests/e2e/report.json`、`home-pricing-zh-{1440,1024,768,phone-dark}.png`；可通过官网目录的上述构建/E2E 命令复跑。范围为 macOS 26.4.1 arm64、Node 24.21.0 的 Chromium 静态官网；未部署或运行桌面测试。

- [x] 2026-10-23 首页价格采用「双卡对照」：标题「提供付费同步」，Free 按系统直接下载并可展开其他系统，Plus 展示集中配置的 $8.99/月和两项云服务权益；浅色边框为黑色，深色为可见前景色。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计、`pnpm test:e2e --no-build` 通过，102/102；新增五语言 1440/768px 的价格/按钮/权益线对齐，扩展下载场景到 Free 卡，验证 macOS/Windows 下载夹具、320/390px 明暗/触摸、无 JavaScript 菜单与既有 FAQ。产物：`apps/website/output/tests/e2e/report.json`、`download-split.json` 和 `home-pricing-zh-{1440,768,phone-dark}.png`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 / Chromium 静态官网；安装包使用受控夹具，未部署、开启购买或运行桌面测试。

- [x] 2026-10-23 FAQ 回答移除 `65ch` 行宽上限，使用问答栏宽度自然换行。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build` 通过，97/97；新增五语言回答宽度回归，1440px 下回答与问答栏均为 1046.15625px，手机、折叠与无 JavaScript 验收保持通过。证据：`apps/website/output/tests/e2e/faq-split.json`、`faq-split-zh-desktop.png` 和 `report.json`。范围为 macOS arm64、Node 24.21.0 的 Chromium 静态官网；未运行桌面测试或部署。

- [x] 2026-10-23 Header 改为不透明主题背景并移除背景模糊。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计及局部 Chromium 检查 16/16 通过：覆盖首页、定价、条款和计费壳，1440/390px、明暗主题与滚动后背景/定位。产物与可复跑脚本：`apps/website/output/tests/header-opaque/`（在官网目录执行 `node output/tests/header-opaque/check.mjs`）。范围为 macOS arm64、Node 24.21.0 的静态官网；未重跑完整官网 E2E 或桌面测试。

- [x] 2026-10-23 FAQ 双栏折叠：`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计、`pnpm test:e2e --no-build` 通过，97/97。验证五语言双栏与上下布局、默认首项/原生互斥展开、Enter/Space 与触摸、320/390px 明暗无溢出、无 JavaScript 问答/支持入口；保留既有八条答案。原大下载区移除，Header `#download` 与定价 Free 入口连通，手机菜单复制实际 Release 链接并显示反馈。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 / Chromium 静态官网；未部署或运行桌面测试。产物：`apps/website/output/tests/e2e/report.json`、`faq-split.json`、`faq-split-zh-desktop.png` 和 `faq-split-zh-phone-dark.png`。

- [x] 2026-10-23 Header 下载按钮收紧：桌面高度由 44px 降为 36px，圆角为 9px；触摸布局保留 44px。`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计通过；局部 Chromium 检查实测 1440px 下为 36px、390/320px 下为 44px，下拉展开与 Esc 关闭正常。产物：`apps/website/output/tests/download-height/`。本次未重跑完整官网 E2E 或桌面测试。

- [x] 2026-10-23 分段下载按钮：`pnpm typecheck`、`pnpm build` / 30 页 SEO 审计和 `pnpm test:e2e --no-build` 通过，89/89。验证 Header/下载区的 macOS 与 Windows 主下载、其他平台下拉、选择后关闭、外部点击/触摸、Esc 焦点、五语言 320/390px 首页与信息页明暗布局、无 JavaScript 访问及语言菜单回归。安装包响应由本地受控夹具替代，未下载真实安装包。修正法语窄屏 Header 溢出，480px 及以下使用系统图标和箭头，保留完整无障碍名称。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 / Chromium 静态官网；无桌面测试或部署。产物：`apps/website/output/tests/e2e/report.json`、`download-split.json` 和 `download-{mac,windows}-{header,section}.png`。

- [x] 2026-10-23 移除全站 Header「目标看板」「智能输入」入口，清理无用首页锚点变量；调整既有导航验收为品牌返回本语言首页和直接锚点定位。官网 `pnpm typecheck`、`pnpm build` / 30 页 SEO 审计、`pnpm test:e2e --no-build` 通过，84/84；五语言 30 个静态页面均无已移除的三个入口。范围为 macOS 26.4.1 arm64、Node 24.21.0 / Chromium 静态官网，未运行桌面测试。产物：`apps/website/output/tests/header-navigation/report.json`、`apps/website/output/tests/e2e/report.json` 和 `desktop-sticky-navigation.png`。

- [x] 2026-10-23 移除全站 Header「版本发布」入口。官网 `pnpm typecheck`、`pnpm build` / 30 页 SEO 审计通过；检查五语言共 30 个静态页面 Header 均无此链接。产物：`apps/website/output/tests/header-navigation/report.json`。本次仅移除静态链接，未重跑 E2E 或桌面测试。

- [x] 2026-10-23 语言菜单收起：官网 `pnpm typecheck`、`pnpm build`（30 页 SEO 审计）、`pnpm test:e2e --no-build` 通过，84/84。新增 Hero/Header/页脚的外部空白点击、内部留白、Esc 与焦点回归；五语言 320/390px 使用真实触摸事件检查外部关闭，无 JS 菜单与语言导航保持通过。首次新增断言将智能输入的预期自动聚焦误判为抢焦点，改用不会转移焦点的看板筛选按钮后通过，未修改产品聚焦行为。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 / Chromium 静态官网，未运行桌面应用测试。产物：`apps/website/output/tests/e2e/report.json` 和 `language-menu-{hero,header,footer}-dismissed.png`。

- [x] 2026-10-23 圆形主题动效：`pnpm typecheck`、`pnpm build`、`pnpm test:e2e --no-build` 通过，81/81（新增 7 个动效场景）。实测新快照伪元素、550ms/ease-in-out、按钮中心及覆盖半径，保存明暗双向中间帧；覆盖信息页/手机、快速连点、减少动态效果及中途变更、键盘、系统跟随、缺失/抛错/跳过 API 和受限存储，无页面错误。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 / Chromium 的静态官网；兼容性回退为受控模拟，Safari/Firefox 真浏览器仍未验收。产物：`apps/website/output/tests/e2e/theme-motion.json`、`theme-circle-*.png` 及完整报告。

- [x] 2026-10-23 菜单栏 hover 留白：背景上下各内缩 3px，展开状态一致，保持原点击区域。`pnpm typecheck`、`pnpm build` / 30 页 SEO 通过；局部 Chromium 检查确认明暗背景内缩均为 3px，手机语言/主题目标均为 44×44px。报告与截图：`apps/website/output/tests/menubar-hover/`；本次未重跑完整官网 E2E。

- [x] 2026-10-23 Hero 状态栏：`pnpm typecheck`、`pnpm build` 和 `pnpm test:e2e --no-build` 通过，74/74。语言/主题位于时间左侧，Header 无重复；验证弹出菜单不被 Hero 裁切、Enter/Tab、切换语言、主题持久化、五语言 320/390px 手机控件至少 44×44px、时间可见、无 JS 语言菜单及信息页 Header 回归。范围仅 macOS 26.4.1 arm64、Node 24.21.0 的 headless Chromium 静态官网；报告和截图在 `apps/website/output/tests/e2e/`。

- [x] 2026-10-23 定稿政策 v1.0：官网 `pnpm typecheck`、`pnpm build`（20 个公开页 + 10 个 noindex 辅助页）和 `pnpm test:e2e --no-build` 通过，72/72。新增五语言政策、长目录/移动深色、无 JS 与锚点实际坐标验收；`billing-policy.json` 及 `billing-policy-*.png` 保存于 `apps/website/output/tests/e2e/`。修正测试读取文档就绪和无 JS 浏览器内等待的问题，未改变全局超时或产品滚动行为。范围仍为 macOS 26.4.1 arm64 / Node 24.21.0 / Playwright 1.63.0 Chromium 静态官网，未进行交易、提供商配置、部署或桌面测试。

- [x] 2026-10-23 商业信息源码：`cd apps/website && pnpm typecheck`、`pnpm build`、`pnpm test:e2e --no-build` 通过，65/65。覆盖五语言价格、周期/键盘/无 JS、公开与 noindex metadata、运营者/政策日期、手机明暗与支持导航、关闭购买/伪造返回/断网、零外部请求和静态 Secret 扫描；报告与截图在 `apps/website/output/tests/e2e/`。范围为 macOS 26.4.1 arm64、Node 24.21.0、Playwright 1.63.0 headless Chromium 的静态官网，未部署、未验证真实付费生命周期或客户端回跳。

- [x] `cd apps/website && pnpm typecheck` 通过。
- [x] `cd apps/website && pnpm build`：五语言页面、sitemap、robots 静态导出，SEO 审计通过；Vercel 线上构建同样通过。
- [x] `cd apps/website && pnpm test:e2e`（构建、SEO 审计与 Playwright headless Chromium）46/46：五语言 SEO 和法律页面、1024/1440/2560px 居中最大宽度、静态全宽 Hero、Hero 与产品窗口一致的 12px 圆角及明暗主题边框、Header 无底部分隔线，品牌/下载按钮、后续 Section 内容及页脚与 Hero 两侧对齐、首帧可见与滚动保持的单一 header、锚点避让、无 JavaScript 首屏、关系线默认且仅两项场景标签、看板筛选/悬停链/新建与撤销/Esc/独立完成/键盘场景切换、URL 外链与本地预览、24px 二级缩进、可变行高连线端点及缩放、关系线轮播、Jev 动图、主题持久化、平台下载、手机布局及减少动效。类型检查、构建及 15 页 SEO 审计通过。运行范围：macOS 26.4.1 arm64、Node 24.21.0；Windows 下载使用 UA 模拟。报告与截图：`apps/website/output/tests/e2e/`。
- [x] 线上 https://www.goalloom.com：五语言页面、sitemap、robots、社交图 200；canonical/hreflang/og 为 www。
- [ ] Windows 11 真机浏览与 Safari/Firefox 浏览器目测由所有者人工验收。

- [x] 2026-10-23 托管 AI 隐私文案同步已验收的生产 v2：五语言区分 TypeSafe/Jev、DeepInfra 与官方 DeepSeek 1017，明确后者可能留存/训练；移除当前一小时结果缓存说法，改为原请求临时处理、单次返回及历史物理擦除边界。官网类型检查、静态构建/30 页 SEO 通过；现有官网 E2E 116/117，日文条款页一次链接等待超时的原记录保留，仅该场景用原断言重放后通过，原因未确认。证据：根目录 `output/tests/hosted-ai/content-minimization/website-acceptance.json` 与 `website-replay/report.json`。仅更新源码，未部署官网或改变购买开放状态。

- [x] 2026-10-24 D2 website local policy copy: all five languages describe independent local retrieval, device-held decryption credentials, explicit replacement with a protective backup, future account deadlines and in-app reminders. Grace starts at the original renewal boundary; deletion distinguishes affected content from account deletion. Removed unused protocol/cache and null billing snapshots. Website `pnpm typecheck`, `pnpm build` / 30-route SEO, `pnpm test:e2e --no-build --only=services` 40/40, `--only=faq` 8/8 and `--only=legal` 22/22 passed. Services/legal share policy coverage through the supported selectors. Reviewed Chinese desktop and Chinese/French 320px dark policy screenshots. Narrow D1-to-D2 copy diff, eleven-file scope, reports and screenshots: `output/tests/billing/desktop/d2-website/`. Scope: macOS 26.4.1 arm64, Node 24.21.0, pnpm 11.9.0, Playwright 1.63.0 / Chromium 153.0.8010.12 static website; physical/VM status not independently checked. D1 core hashes, public 1.9.10 and closed launch flags remain unchanged. No provider queries/writes, deployment, desktop/full verify/stress or packaged/Windows acceptance. Production cleanup and supplier backup/restore arrangements remain separate launch requirements; the later owner-approved policy replaces the fixed backup-expiry promise with the applicable infrastructure provider’s retention policy.

- [x] 2026-10-25 Removed the fixed full-copy backup-expiry promise from all five service/legal catalogs and the shared numeric interpolation. Restricted disaster-recovery copies may remain until expiry under the applicable infrastructure provider’s retention policy; they do not offer user recovery or continued service, and infrastructure restoration must reapply deletion records before access resumes. No immediate physical-erasure or daily-backup promise is added. The policy revision date is 2026-10-25; policy v1.0, the original finalization date, 30-day retrieval, seven-day online deletion, necessary record limits, tax/price/trial/refund rules and closed purchase gates are preserved. Website `pnpm typecheck`, `pnpm build` / 30-route SEO and complete mapped E2E selectors passed: services 40/40, legal 22/22 and FAQ 8/8. Final reports, policy facts, screenshots and matching source/export SHA-256 manifests: `apps/website/output/tests/backup-policy-20261025-final/`. Earlier attempts are recorded in `acceptance.json`: initial sandbox loopback denial; passing pre-review-date suites; two stale-date SEO-gate failures before the assertion was corrected. Scope: macOS 26.4.1 arm64, Node 24.21.0, pnpm 11.9.0, Playwright 1.63.0 / Chromium 153.0.8010.12 static website; physical/VM status not independently checked. No desktop/full verify/stress, provider writes, sales activation or deployment. Backup operations, expiry retention and production backup/restore acceptance remain separate work.
