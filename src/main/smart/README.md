# smart/

> 父级：[main](../README.md)。Jev 智能输入的主进程服务；renderer 只能经 `goalloom:smart` 有限动作访问。

```text
smart/
├── providers.ts    # JEV_PROVIDERS 固定预设；TypeSafe systemOne / Gateway /v1/evaluate adapter、统一答案、错误归一化
├── credentials.ts  # DeviceStore：OS 保护加密 Key、设备配置（activeProvider/providerRevision/enabledForGeneration）
├── service.ts      # SmartInputService：测试并启用、代次门控、单链取消、冷却、会话缓存、一轮＋可选补充轮
├── context.ts      # 经 StorageClient 短只读查询构造 SmartContext（日期/周期/≤8 候选）
└── electron.ts     # safeStorage/shell 组合点，装配服务
```

语义题单、预算、日期与概率策略是 `src/domain/smart` 的纯函数；本目录只负责网络、凭据、取消和门控。Key 不进入业务 SQLite、导出、备份或日志，读取失败保留加密文件、绝不明文回退。设备配置不进入 workspace 表；整库恢复/重置产生新 generation 后自动暂停智能发送。确认后的写入仍走 worker → Repository 的 `createPlan` 事务。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
