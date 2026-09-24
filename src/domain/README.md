# domain/

> 父级：[项目地图](../../README.md)。纯领域库，不依赖 Electron、SQLite 或全局时钟。

```text
domain/
├── calendar.ts   # 日/周/月/原锚点三个月区间、固定 IANA 边界
├── relations.ts  # 多父 DAG，线性整图拓扑校验与增量防环；新建关联的周期规则（上级周期更长、Later 不参与）
├── flows.ts      # 流程归属：复用祖先缓存解析带颜色的流程根
├── rollover.ts   # 往期可发现性、自动候选与撤销 hold 的纯判断
├── undo.ts       # 效果字段/关系身份/语义顺序匹配，不依赖整体版本
├── history.ts    # 顺序流式投影期末与有界后续明细，缺失/回拨为 unknown
├── import-validation.ts # 严格 v1–v5 数据集、DAG、效果/逆事件索引与计划完整撤销校验
├── plan.ts       # createPlan 批内约束与稳定拓扑序（父在前、同级保持草稿顺序）
├── status.ts     # 独立状态时间组、效果匹配与差量逆转
└── smart/        # 智能输入纯规则
    ├── segments.ts     # 强/弱边界无损槽位（≤8）与普通模式单条 Later
    ├── dates.ts        # 工作区 weekStart 的星期、绝对/月底日期与完整/省略终点的范围歧义
    ├── questions.ts    # 原文直接作 state 的题单，Q=1+3S+D+3+R≤64，payload/token 预算与补充轮
    ├── distribution.ts # 统一 Choice/boolean 契约校验、K×d 总和容差、top/margin/集中度与确定性
    └── preview.ts      # 答案组装为可编辑预览：角色归并、执行/截止、多父建议去环、警示
```

调用方注入观察时间及已经校验的快照；smart/ 不做网络请求，也不读取供应商 confidence。权威事务仍须重读并复核。`reverseStatus` 只是一种效果的原语，不代表完整撤销命令。D06 为多父 DAG；D07 为从原锚点推导的三日历月，月底截断而不逐轮漂移。

[PROTOCOL]: Update this header when making changes, then check README.md.
