# scripts/

> 父级：[项目地图](../README.md)。构建和测试辅助代码，不进入正式包。

```text
scripts/
├── test-unit.mjs           # 用锁定 Electron 自带 Node 运行 Vitest
├── test-electron.mjs       # 单独构建/启动真实 main 的 SQLite 探针
├── test-desktop.mjs        # 源构建或目录包的真实窗口自动化
├── test-dialogs.mjs        # 需操控原生保存/打开对话框的 JSON 导出恢复验收
├── test-recovery.mjs       # 真实窗口保护备份/维护/显式重置/SQLite 恢复/重启暂停
├── test-performance.mjs   # 10,000条目/真实事件、存储延迟与窗口启动/内存测量
├── test-history.mjs        # 独立历史数据夹具、真实窗口只读历史/往期/hold 与恢复清理旧缓存
├── third-party-notices.mjs # 从安装依赖汇总原始许可证，随离线包交付
└── check-production.mjs    # 检查产物无 HMR/测试入口/第二图标库
```

测试构建只进入忽略的 `.electron-test/`；截图只进入 `output/playwright/`。正式打包只纳入 `out/` 和 package 元数据，应用依赖已在构建时打包，不分发完整图标库或开发工具。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
