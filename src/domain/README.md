# domain/

> 父级：[项目地图](../../README.md)。纯领域库，不依赖 Electron、SQLite 或全局时钟。

```text
domain/
├── calendar.ts   # 日/周/月/原锚点三个月区间、固定 IANA 边界
├── relations.ts  # 多父 DAG，自关联/重复/环与端点校验
├── rollover.ts   # 往期可发现性、自动候选与撤销 hold 的纯判断
├── undo.ts       # 效果字段/关系身份/语义顺序匹配，不依赖整体版本
└── status.ts     # 独立状态时间组、效果匹配与差量逆转
```

调用方注入观察时间及已经校验的快照；权威事务仍须重读并复核。`reverseStatus` 只是一种效果的原语，不代表完整撤销命令。D06 为多父 DAG；D07 为从原锚点推导的三日历月，月底截断而不逐轮漂移。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
