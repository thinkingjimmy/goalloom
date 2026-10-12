# apps/desktop/scripts/

> 父级：[项目地图](../../../docs/development.md)。桌面测试运行器与构建工具，不进入正式包。仓库级脚本在 [scripts](../../../scripts/README.md)。

```text
scripts/
├── test.mjs                   # 用锁定 Electron 自带 Node 运行仓库根 Vitest 配置
├── eval/                      # 智能输入真实服务评测（需 .env.local 中的 OPENROUTER_API_KEY，不进 CI）
│   ├── cases.ts
│   ├── smart.ts
│   ├── run.mjs                # `pnpm eval:smart [case-id…]`
│   └── assistance/            # `pnpm eval:assistance`
└── build/
    ├── third-party-notices.mjs
    ├── check-production.mjs
    ├── debug-artifacts.mjs
    ├── package-report.mjs
    ├── package-experiment.mjs
    ├── package-locales.json
    └── package-budgets.json
```

这些脚本的路径相对于 `apps/desktop`。根目录的 `/build/` 忽略规则不会屏蔽 `scripts/build/`。正式打包只纳入 `out/` 和 package 元数据。

Calendar code uses native Temporal from the pinned Electron runtime. The polyfill package supplies development types only; the build rejects its runtime and JSBI in all bundles, and rejects Zod in the renderer.

[PROTOCOL]: Update this header when making changes, then check README.md.
