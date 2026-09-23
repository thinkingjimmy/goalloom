# scripts/

> 父级：[项目地图](../README.md)。运行器和构建工具，不进入正式包；测试场景归属 tests。

```text
scripts/
├── test.mjs                   # 用锁定 Electron 自带 Node 运行 Vitest
└── build/
    ├── third-party-notices.mjs # 汇总安装依赖原始许可证，随离线包交付
    └── check-production.mjs    # 检查产物无 HMR/测试入口/第二图标库
```

通过仓库根目录的 npm scripts 调用；路径相对于项目根。真实 Electron 场景与夹具统一在 [tests/desktop](../tests/desktop/README.md)。构建工具源码位于 `scripts/build/`，根目录 `/build/` 的忽略规则不会屏蔽这些脚本。

正式打包只纳入 `out/` 和 package 元数据，应用依赖已在构建时打包，不分发完整图标库或开发工具。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
