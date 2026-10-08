# smart/

> 父级：[main](../README.md)。AI 服务（智能输入的 Jev、流程洞察的 DeepSeek）的主进程服务；renderer 只能经 `goalloom:smart` 有限动作访问。

```text
smart/
├── providers.ts    # Jev 固定预设（OpenRouter System One、Gateway evaluate）与错误归一化；System One 使用时才加载 SDK，Gateway 请求时才取 fetch
├── credentials.ts  # DeviceStore：OS 保护加密 Key、设备配置 v3（每服务同意/能力验证/账户失败，每功能服务/修订/绑定代次），读取时继承 v1/v2；新增正文/执行摘要 purpose consent 默认未同意，并移除已下线的 TypeSafe 原生条目（绑定的功能关闭、删除其 Key 文件）
├── service.ts      # 状态/配置、逐能力连接测试（任一通过即保存，自动开启尚无服务的功能）、按需加载题单/预览；取消、按服务冷却、32 项/512 KiB 缓存，会话释放清空
├── insight.ts      # 流程洞察：OpenRouter / AI Gateway chat completions（固定 DeepSeek flash、关推理、JSON、Gateway 只路由到 DeepSeek）与能力样例
├── assistance.ts   # Local preflight tickets or normal cancellation, identity-owned cleanup across async reads, provider consent, three accepted turns and eight/512 KiB sessions including pending reads
├── context.ts      # 经 StorageClient 短只读查询构造 SmartContext（模式、起点、六尺度日期/周期、≤8 候选）
└── electron.ts     # safeStorage/shell 组合点，装配服务
```

语义题单、预算、日期与概率策略是 `src/domain/smart` 的纯函数；本目录只负责网络、凭据、取消和门控。Key 不进入业务 SQLite、导出、备份或日志，读取失败保留加密文件、绝不明文回退。设备配置不进入 workspace 表；智能输入与洞察各自绑定 generation，整库恢复/重置后都自动暂停，需在各自设置页重新打开。账户级失败（认证、额度、付款、权限、路由）记在服务上，下一次成功或重测后清除。新辅助通过 worker 的相同执行事实装配上下文；仅显式生成才发网络。起草/复盘扩展信息按 purpose consent 投影，历史按固定 cutoff。确认后的写入仍走 worker → Repository：原计划使用 `createPlan`，推进说明与可选移动使用 `applyAssistance`。

启动状态读取不加载题单、预览或 TypeSafe SDK。renderer 关闭、重载、崩溃与整库替换会取消预检、连接测试及判断，并释放会话预览缓存；设备配置与加密凭据保留。

Assistance preflight rechecks session ownership after every awaited read. Cancellation and replaced generations return the existing `cancelled` reply through main/preload; they do not reject IPC or show a failure. A late completion/error can only remove its own session object. Uncancelled storage/configuration failures still surface normally. Pending preflights share the eight-session limit.

[PROTOCOL]: Update this header when making changes, then check README.md.

Task note assistance is enabled by the insight feature setting and the connected provider consent. It requires no additional task-level checkbox. Rewrite mode returns complete Markdown in one response, refuses truncated source notes, checks completed tasks/links, and binds the accepted output to the main-owned preflight ticket before the worker writes. Purpose consent for separate draft/review enrichment remains unchanged.
