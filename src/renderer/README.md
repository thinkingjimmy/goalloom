# renderer/

> 父级：[项目地图](../../README.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 组合功能视图、快捷键、悬浮新建和操作反馈
├── main.tsx                 # React 挂载
├── index.html               # 本地页面；生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind、深浅 token、极简看板/弹窗/菜单、细滚动条与可访问性
├── features/                # 按用户功能聚合页面及其专属组件
│   ├── shell/TopBar.tsx     # 可拖动顶栏：流程筛选、搜索、视图菜单、设置
│   ├── board/
│   │   ├── Board.tsx        # 五列、指针优先落点的 dnd-kit 排序、列头与折叠
│   │   ├── TaskRow.tsx      # 单行卡片：流程描边复选框、标题与截止/说明/顺延提示
│   │   ├── QuickAdd.tsx     # 列内连续录入：加入流程/新流程/拆解上级
│   │   ├── HistoryColumn.tsx # 独立列只读历史、期末与后来结果
│   │   └── Backlog.tsx      # 往期分页、选择和批量安排
│   ├── items/
│   │   ├── ItemDetail.tsx   # 居中详情：草稿/退出保护、流程颜色、生命周期、移动与拆解
│   │   ├── DuePicker.tsx    # 截止日快捷选项与日期输入
│   │   ├── RelationPicker.tsx # 上级/下级勾选列表，流程根不能作下级
│   │   ├── ItemList.tsx     # 分页搜索、状态时间分组、归档和回收站
│   │   └── Activity.tsx     # 按真实事件序列分页查看活动
│   ├── setup/Setup.tsx      # 日历预览与首次显式确认
│   ├── settings/Settings.tsx # 主题、日历/策略/备份、维护与整库两阶段确认
│   └── search/CommandPalette.tsx # 快捷搜索、命令、视图跳转与撤销入口
├── components/              # 可跨功能使用的 UI 原语
│   ├── Modal.tsx            # 原生 dialog 焦点限制、Esc/背景关闭与统一页眉
│   ├── Popover.tsx          # 锚点浮层，外部按下/Esc 关闭且不关闭外层弹窗
│   ├── FlowMark.tsx         # 与复选框同构的流程色块
│   ├── icons/index.tsx      # 唯一 Hugeicons 免费显式导入入口
│   └── ui/                 # Radix/CVA Button 与 shadcn 原始 MIT 授权
├── state/
│   ├── session.ts          # 纯会话撤销成员、代次隔离、反馈去重
│   ├── flows.ts            # 快照派生的流程列表、条目归属与颜色占用
│   └── use-workspace.ts    # 权威快照、幂等提交、未知结果同 ID 重试
├── i18n/messages.ts         # 集中中文文案与同类型语言表契约
└── lib/
    ├── colors.ts            # 八组固定配对色板、色名与流程描边值
    ├── dates.ts             # 纯日历日加减与中文日期格式
    └── utils.ts             # Tailwind class 合并
```

`App → features → components / state / i18n / lib`；跨功能数据类型来自 `shared/contracts`，不从另一个功能的组件反向导入。通用 UI 不依赖 features，业务规则属于 domain/main。仅一个功能使用的组件放在该功能内，多处复用时再提升到 components。

取消/失败不乐观伪造业务结果。UndoSession 只保存已提交的用户操作 ID；历史与业务数据不复制进本地状态。未保存草稿保留到明确保存或放弃；整库代次更换销毁旧抽屉、Toast、栈与缓存。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
