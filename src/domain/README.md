# domain/

> 父级：[项目地图](../../README.md)。纯领域库，不依赖 Electron、SQLite 或全局时钟。

```text
domain/
├── calendar.ts   # 日/周/月日历区间、固定 IANA 边界和时间比较
├── rollover.ts   # 往期可发现性、自动候选与撤销 hold 的纯判断
└── status.ts     # 独立状态时间组、效果匹配与差量逆转
```

调用方注入观察时间及已经校验的快照；权威事务仍须重读并复核。`reverseStatus` 只是一种效果的原语，不代表完整撤销命令：生命周期、工作区、操作回执及依赖保护尚待命令层实现。D07 未确认，不实现 cycle 默认值。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
