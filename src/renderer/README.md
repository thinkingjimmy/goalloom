# renderer/

> 父级：[项目地图](../../README.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 首次配置/五列/状态列表组合、快捷键和操作反馈
├── main.tsx                 # React 挂载
├── index.html               # 本地页面；生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind、配对主题、焦点/强制颜色/减少动效
├── components/
│   ├── Settings.tsx         # 只读日历/策略/备份、持续维护与整库两阶段确认
│   ├── Setup.tsx            # 三项日历预览与显式确认
│   ├── Board.tsx            # 五列、独立滚动、录入、状态切换与 dnd-kit 排序
│   ├── ItemDetail.tsx       # 当前草稿、生命周期、关系双入口、拆解
│   ├── ItemList.tsx         # 分页中文搜索、状态时间分组、归档和回收站
│   ├── HistoryColumn.tsx    # 独立列只读历史、期末与后来结果
│   ├── Backlog.tsx          # 往期分页、选择和当前/Later 批量安排
│   ├── Activity.tsx         # 按真实事件序列分页查看活动
│   ├── CommandPalette.tsx   # 快捷搜索、视图跳转与撤销入口
│   ├── Modal.tsx            # 原生 dialog 焦点限制和关闭
│   ├── icons/index.tsx      # 唯一 Hugeicons 免费显式导入入口
│   └── ui/                 # Radix/CVA Button 与 shadcn 原始 MIT 授权
└── lib/
    ├── colors.ts            # 八组固定配对色板与稳定 ID 哈希
    ├── session.ts           # 纯会话撤销成员、代次隔离、反馈去重
    ├── use-workspace.ts     # 权威快照、幂等提交、未知结果同 ID 重试
    ├── messages.ts          # 首版中文基础文案
    └── utils.ts             # Tailwind class 合并
```

领域规则属于 domain/main；取消/失败不乐观伪造业务结果。UndoSession 只保存已提交的用户操作 ID；历史与业务数据不复制进本地状态。未保存草稿保留到明确保存或放弃；整库代次更换销毁旧抽屉、Toast、栈与缓存。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
