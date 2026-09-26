# smart/

> 父级：[main](../README.md)。Jev 智能输入的主进程服务；renderer 只能经 `goalloom:smart` 有限动作访问。

```text
smart/
├── providers.ts    # 固定预设与错误归一化；System One 使用时才加载 SDK，Gateway 请求时才取 fetch
├── credentials.ts  # DeviceStore：OS 保护加密 Key、设备配置（activeProvider/providerRevision/enabledForGeneration）
├── service.ts      # 轻量状态/配置、按需加载题单/预览；覆盖异步预检的取消、冷却、32 项/512 KiB 缓存，会话释放清空
├── context.ts      # 经 StorageClient 短只读查询构造 SmartContext（日期/周期/≤8 候选）
└── electron.ts     # safeStorage/shell 组合点，装配服务
```

语义题单、预算、日期与概率策略是 `src/domain/smart` 的纯函数；本目录只负责网络、凭据、取消和门控。Key 不进入业务 SQLite、导出、备份或日志，读取失败保留加密文件、绝不明文回退。设备配置不进入 workspace 表；整库恢复/重置产生新 generation 后自动暂停智能发送。确认后的写入仍走 worker → Repository 的 `createPlan` 事务。

启动状态读取不加载题单、预览或 TypeSafe SDK。renderer 关闭、重载、崩溃与整库替换会取消预检、连接测试及判断，并释放会话预览缓存；设备配置与加密凭据保留。

[PROTOCOL]: Update this header when making changes, then check README.md.
