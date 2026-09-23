# tests/

> 父级：[项目地图](../README.md)。测试证据按层划分，不互相冒充验收。

```text
tests/
├── domain/
│   ├── calendar.test.ts     # 时区、DST、午夜、自然月与跨年周
│   ├── rollover.test.ts     # 策略范围、维护/恢复暂停、往期可见与 hold
│   ├── status.test.ts       # 独立状态时间组和保留无关字段的逆转
│   ├── security.test.ts     # 本地协议路径约束与 CSP 静态约束
│   └── colors.test.ts       # 八组浅/深色文字与边框对比度
├── repository/database.test.ts # 实际 SQLite/WAL/事务/副本与失败保留
└── fixtures/electron-probe.ts   # 真正 Electron main 的驱动、事务和恢复探针
```

`npm test` 使用锁定 Electron 自带的 Node 运行 Vitest；`npm run test:electron` 使用实际 Electron main，在临时中文/空格路径验证内置驱动。探针不进入生产构建。临时目录由测试创建并清理，不访问用户任务。

`scripts/test-desktop.mjs` 以 Playwright 控制真正的 Electron 窗口，检查生产资源协议、CSP、preload/worker、来源拒绝、主题和窄窗口；传入可执行文件时检查目录包。自动化关闭 CDP 默认的 unsafe-eval 绕过再验证 CSP。正式应用没有测试 IPC 或时钟控制口。

纯函数与 repository 通过不表示打包桌面、Windows 安装、IME 或睡眠验收通过。实际命令、运行版本和平台范围记录于开发提交/PR。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
