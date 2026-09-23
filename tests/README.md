# tests/

> 父级：[项目地图](../README.md)。按被测层和运行环境划分；测试证据不互相冒充验收。

```text
tests/
├── domain/
│   ├── calendar.test.ts     # 时区、DST、午夜、自然月与跨年周
│   ├── rollover.test.ts     # 策略范围、维护/恢复暂停、往期可见与 hold
│   └── status.test.ts       # 独立状态时间组和保留无关字段的逆转
├── main/security.test.ts    # 本地协议路径约束与 CSP 静态约束
├── renderer/
│   ├── session.test.ts      # 会话去重、非栈顶/冲突单项移除、代次隔离
│   └── colors.test.ts       # 八组浅/深色文字与边框对比度
├── integration/
│   ├── database.test.ts     # 实际 SQLite/WAL/事务/副本与失败保留
│   ├── commands.test.ts     # 首次确认、唯一位置、幂等、DAG 和中文搜索
│   ├── history.test.ts      # 周期成员/期末/后来结果、分页、批量往期与回拨
│   ├── reconcile.test.ts    # 自动策略边界、批次部分撤销、排除、hold 与暂停
│   ├── transfer.test.ts     # JSON/SQLite、保护备份、维护、原子替换故障与 baseline
│   └── undo.test.ts         # 生命周期、效果撤销/冲突、原始时间与 hold
└── desktop/                 # 真实 Electron 场景与专属夹具，见局部地图
```

`npm test` 使用锁定 Electron 自带的 Node 运行全部 Vitest 测试；`test:domain` 只运行纯领域层，`test:integration` 运行 SQLite 集成测试（保留 `test:repository` 别名）。临时工作区由测试创建并清理，不访问用户任务。桌面自动化独立运行，正式应用没有测试 IPC 或时钟控制口。

纯函数与集成测试通过不表示打包桌面、Windows 安装、IME 或睡眠验收通过。实际命令、运行版本和平台范围记录于开发提交/PR。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
