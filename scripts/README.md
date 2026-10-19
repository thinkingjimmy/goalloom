# scripts/

> 父级：[项目地图](../docs/development.md)。仓库级运行脚本，不进入正式包。桌面 Vitest 运行器、智能输入评测和打包检查在 [apps/desktop/scripts](../apps/desktop/scripts/README.md)。

```text
scripts/
├── deploy/               # Guarded production Supabase deployment, migration history and rollback-only SQL acceptance
├── parity-digest.mjs      # Electron Node 上的加密摘要，可与 Hermes digest 对比
├── phase0-prototype.mjs   # 托管双端原型（需要 supabase/README.md 里的三个 API 变量）
├── supabase-remote.mjs    # 对托管库做 Realtime / Storage 检查
├── supabase-reset.mjs     # 托管库重置辅助
├── pg-sync-test.mjs       # 用 psql 跑 supabase/tests pgTAP
├── sync-security-hosted.mjs # Rollback-only real PostgreSQL/pgTAP acceptance; optional tested development migration apply, no API-key retrieval
├── sync-security-live.mjs # Authorized memory-only keys, disposable real Auth/HTTP/Realtime/SQLite journeys and scoped cleanup
├── gen-sync-security-fixtures.mjs # Deterministic signed recovery proofs with --check
├── gen-ed25519-fixtures.mjs
└── gen-vectors.ts         # 重写 packages/crypto/test/vectors.json
```

从仓库根目录调用。`pnpm parity:digest` 与 `pnpm test:phase0` 仍是根脚本。桌面命令（`pnpm test`、`pnpm build`、`pnpm test:ui` 等）是转到 `@goalloom/desktop` 的薄封装，工作目录为 `apps/desktop`。

[PROTOCOL]: Update this header when making changes, then check README.md.
