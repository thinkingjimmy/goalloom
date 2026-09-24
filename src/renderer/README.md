# renderer/

> 父级：[项目地图](../../README.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 组合功能视图、全局快捷键分发（含按顶栏位置筛选流程）、FAB/新建快捷键全局 composer、可选 Jev 步骤和操作反馈
├── main.tsx                 # React 挂载
├── index.html               # 本地页面；生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind、深浅 token、极简看板/弹窗/菜单、细滚动条与可访问性
├── features/                # 按用户功能聚合页面及其专属组件
│   ├── shell/               # 应用外壳：常驻顶栏及其打开的全局弹窗
│   │   ├── TopBar.tsx       # 可拖动顶栏：流程筛选、搜索、列显示勾选浮层、设置
│   │   ├── CommandPalette.tsx # 快捷搜索、命令、打开已完成/回收站与撤销入口
│   │   └── settings/        # 左侧三组导航（偏好/工作区/条目）+ 页头说明 + 分组卡片的设置弹窗；外观含语言
│   │       ├── Settings.tsx     # 容器：分组导航与状态提示、页头（说明/恢复默认/结束方式）、备份/批次/数量读取、数据动作与预览状态
│   │       ├── AppearancePane.tsx # 语言/风格/复选框/明暗分段（带色块示意）与关系线开关
│   │       ├── ShortcutsPane.tsx # 快捷键：通用组点键帽录制、冲突警告与清除；流程筛选开关 + 位置示意
│   │       ├── SmartPane.tsx    # 智能输入：状态卡、服务单选列表（Key 更换/删除，表单在行下展开）、隐私要点
│   │       ├── CalendarPane.tsx # 三栏只读日历、逐列顺延策略（说明随选择变化）、可撤销的顺延记录
│   │       ├── BackupPane.tsx   # 备份与恢复：状态/每日开关/保留份数、备份列表、导出与单一文件恢复、危险区重置
│   │       ├── ItemsPane.tsx    # 条目：已完成/已取消/已归档/回收站的搜索、今天/昨天分组与行内还原
│   │       ├── TransferReview.tsx # 三步进度与整库替换的两阶段确认
│   │       ├── parts.tsx        # 分组/行/分段选择（色块、数量）/开关原语，工作区时区时间与相对日期
│   │       └── settings.css     # 设置弹窗专属样式（仅 token）
│   ├── composer/            # 全局新建：普通单条 Later / Jev 可编辑预览
│   │   ├── Composer.tsx     # 工作区生命周期内持有草稿/在途保存，弹窗关闭停止分析，回执按修订清理，createPlan 确认
│   │   ├── DraftCard.tsx    # 预览项：执行列范围、截止、多上级、建议 chips、手动新流程
│   │   ├── draft.ts         # 纯草稿模型：手动优先合并、orphan、计划负载与本地复核
│   │   └── composer.css     # composer 与连接表单样式（仅 token）
│   ├── smart/
│   │   ├── JevConnect.tsx   # 服务单选、Key、同意、测试并启用（Onboarding/设置共用；提交按钮可渲染到底栏）
│   │   ├── JevDemo.tsx      # 不调用服务的预设示例动画：逐字输入 → 整理中 → 草稿卡
│   │   └── JevStep.tsx      # 首次流程第 3 步：先看示例，选择连接才填 Key，通过或跳过都进入看板
│   ├── board/
│   │   ├── Board.tsx        # 可见列/历史状态、键盘和指针共用可编辑落点、虚拟排序、列头与折叠
│   │   ├── VirtualRows.tsx # 可测量行高、有界 DOM、逻辑 Tab/Home/End、拖动/焦点锁定与定位
│   │   ├── TaskRow.tsx      # 单行卡片：流程圆点、流程描边复选框、标题与截止/说明/顺延提示，点亮时铺流程底色
│   │   ├── FlowDot.tsx      # 复选框前的流程圆点：起点改色、下级改上级、独立条目二选一；悬停预览流程；Later 不显示
│   │   ├── RelationLines.tsx # 单流程筛选或圆点预览时的只读关系线层：按流程着色、终点落在下级圆点、跨级沿行间穿过、链高亮、滚出视野标记
│   │   ├── QuickAdd.tsx     # 列头＋/拆解的列内连续录入：加入（根在更长周期的）流程/新流程/拆解上级；Later 不选流程
│   │   ├── HistoryColumn.tsx # 独立列只读历史：期末状态标记与标签、变化后的当前状态
│   │   └── Backlog.tsx      # 往期分页、选择和批量安排
│   ├── items/
│   │   ├── ItemDetail.tsx   # 居中详情：草稿/退出保护、流程颜色、生命周期、移动与拆解；Later 不设流程和关联
│   │   ├── DuePicker.tsx    # 截止日快捷选项与日期输入
│   │   ├── RelationPicker.tsx # 上级/下级勾选列表（详情与看板圆点共用）：只列周期合规的候选，流程根不能作下级
│   │   ├── FlowPicker.tsx   # 详情标题前的流程色点；FlowColorMenu 为色板本体，看板圆点复用
│   │   └── Activity.tsx     # 按真实事件序列分页查看活动
│   └── setup/
│       ├── Setup.tsx        # 首次流程前两步的状态：方向草稿 → 日历确认
│       ├── OnboardingFrame.tsx # 三步进度、语言、固定底栏（主按钮统一在右下）
│       ├── DirectionStep.tsx # 写下三个月的方向（示例可填入），确认前只存草稿
│       ├── CalendarStep.tsx # 一句话三胶囊（时区/周起始/3个月起点）与剩余天数，显式确认锁定日历
│       ├── BoardPreview.tsx # 真实列头与空状态的只读预览，方向以「待确认」行放进 3个月
│       ├── TimezoneSelect.tsx # 仅可选择的时区下拉：浮层搜索、键盘选择、GMT 偏移
│       └── onboarding.css   # 首次流程样式（仅 token）
├── components/              # 可跨功能使用的 UI 原语
│   ├── Modal.tsx            # 原生 dialog 焦点限制、Esc/背景关闭与统一页眉
│   ├── Popover.tsx          # 锚点浮层，外部按下/Esc 关闭且不关闭外层弹窗；floating 经 portal 浮出滚动容器
│   ├── FlowMark.tsx         # 与复选框同构的流程色块
│   ├── Kbd.tsx              # 一键一帽的组合键展示（平台符号）
│   ├── LanguageSelect.tsx   # 首次配置与设置外观共用的语言下拉（语言名用各自原文）
│   ├── icons/index.tsx      # 唯一 Hugeicons 免费显式导入入口
│   └── ui/                 # shadcn Button（Radix Slot/CVA）、Select（Radix，替代原生 select，列表 portal 进所在 dialog）与 MIT 授权
├── state/
│   ├── snapshot.ts         # 按身份/内容共享未变快照分支，忽略不可见核对变化
│   ├── session.ts          # 纯会话撤销成员、代次隔离、反馈去重
│   ├── flows.ts            # 快照派生的流程列表（含顶栏顺序的可见流程）、条目归属与颜色占用
│   ├── columns.ts          # 本机列显示偏好（localStorage，至少一列，不入工作区）
│   ├── relation-lines.ts   # 本机关系线开关（localStorage，默认开，只存关闭，不入工作区）
│   ├── language.ts         # 语言偏好镜像：首次渲染前装载、choose 写入 main 并即时切换
│   ├── shortcuts.ts        # 本机快捷键：定义表、按物理键解析/校验/格式化、流程筛选开关、改键存储（localStorage，不入工作区）
│   ├── smart.ts            # 设备侧智能输入状态与动作（代次变化即重读）
│   └── use-workspace.ts    # 合并刷新、稳定快照、类型化错误/反馈、幂等提交与未知结果重试
├── i18n/
│   ├── index.ts             # 唯一文案入口：当前语言的实时视图（原地替换，不重挂载）、setLocale/useLocale
│   ├── format.ts            # 按当前语言的 Intl 日期/星期/时间/数字格式
│   └── locales/             # zh 为源语言（messages/smart/settings/shortcuts 四分册 + index），en/ja/es/fr 同构，缺键即类型错误
└── lib/
    ├── colors.ts            # 八组固定配对色板、色名与流程描边值
    ├── dates.ts             # 纯日历日加减与月末（本地化格式在 i18n/format）
    ├── timezones.ts         # IANA 时区的 GMT 偏移标签
    └── utils.ts             # Tailwind class 合并
```

`App → features → components / state / i18n / lib`；跨功能数据类型来自 `shared/contracts`，不从另一个功能的组件反向导入。通用 UI 不依赖 features，业务规则属于 domain/main。仅一个功能使用的组件放在该功能内，多处复用时再提升到 components。

取消/失败不乐观伪造业务结果。UndoSession 只保存已提交的用户操作 ID；历史与业务数据不复制进本地状态。未保存草稿保留到明确保存或放弃；整库代次更换销毁旧弹窗、Toast、栈与缓存。

[PROTOCOL]: Update this header when making changes, then check README.md.
