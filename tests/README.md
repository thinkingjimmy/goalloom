# tests/

> 父级：[项目地图](../docs/development.md)。按被测层和运行环境划分；测试证据不互相冒充验收。

```text
tests/
├── domain/
│   ├── calendar.test.ts     # 时区、DST、午夜、自然月与跨年周
│   ├── calendar-modes.test.ts # Rolling/natural 12/6/3-month boundaries, nesting, DST and six-horizon schemas
│   ├── calendar-phrases.test.ts # Injected-clock Chinese year/half phrases at half-year/year boundaries
│   ├── flows.test.ts        # 多父 DAG 上的流程根归属与去重
│   └── smart.test.ts        # weekStart 1–7 日期、槽位、K×d 概率容差、64 题预算、预览组装与计划拓扑
├── main/
│   ├── security.test.ts     # 本地协议路径约束与 CSP 静态约束
│   └── smart.test.ts        # 三渠道请求形状/路由/精度、错误归类、凭据与代次门控、取消/冷却/缓存（fixture，非真实服务）
├── renderer/
│   ├── session.test.ts      # 会话去重、非栈顶/冲突单项移除、代次隔离
│   ├── colors.test.ts       # 八组浅/深色对比度、流程描边与拼色
│   └── draft.test.ts        # composer 手动优先合并、orphan、计划负载与本地复核
├── integration/
│   ├── database.test.ts     # 实际 SQLite 副本的失败保留与悬空引用拒绝
│   ├── commands.test.ts     # 首次确认、DAG 周期规则、库级防环和中文搜索
│   ├── calendar-modes.test.ts # Stale setup, manual year/half, six-horizon writes/review, order materialization/undo/restart and round trips
│   ├── history.test.ts      # 周期成员/期末/后来结果、分页、批量往期与回拨
│   ├── reconcile.test.ts    # 自动策略边界、批次部分撤销、排除、hold 与暂停
│   ├── transfer.test.ts     # JSON/SQLite、保护备份、维护、原子替换故障与 baseline
│   ├── flows.test.ts        # 流程颜色唯一/根约束、还原与撤销冲突、旧数据导入
│   ├── plan.test.ts         # createPlan 拓扑/入边归属/同代次撤销还原闭环/跨代次 JSON·SQLite 恢复/伪造导入
│   ├── startup.test.ts      # Read-only v1–v5 refusal without copies or byte changes, including uncheckpointed WAL
│   └── undo.test.ts         # 生命周期、效果撤销/冲突、原始时间与 hold
└── desktop/                 # 真实 Electron 场景与专属夹具，见局部地图
```

`pnpm test` 使用锁定 Electron 自带的 Node 运行全部 Vitest 测试；`test:domain` 只运行纯领域层，`test:integration` 运行 SQLite 集成测试（保留 `test:repository` 别名）。临时工作区由测试创建并清理，不访问用户任务。桌面自动化独立运行，正式应用没有测试 IPC 或时钟控制口。

`tests/main/smart.test.ts` 只用受控 fixture 验证请求/响应契约，不代表各渠道真实 Key 已联调。纯函数与集成测试通过不表示打包桌面、Windows 安装、IME 或睡眠验收通过。实际命令、运行版本和平台范围记录于开发提交/PR。

[PROTOCOL]: Update this header when making changes, then check README.md.
