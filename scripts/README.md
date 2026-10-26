# scripts/

> 父级：[项目地图](../docs/development.md)。仓库级运行脚本，不进入正式包。桌面 Vitest 运行器、智能输入评测和打包检查在 [apps/desktop/scripts](../apps/desktop/scripts/README.md)。

```text
scripts/
├── deploy/               # Guarded production Supabase deployment, migration history and rollback-only SQL acceptance
├── development-target.mjs # Exact development-project guard for hosted test/admin tools
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

`hosted-ai/` contains manual development Edge deployment, rollback-only PostgreSQL checks, controlled HTTP acceptance, affected-feature acceptance and a read-only UTC usage report. See [tool contracts](hosted-ai/README.md). No model calls occur in deployment, SQL checks, status checks or usage reporting.

`hosted-ai/production.mjs` is the separate explicitly authorized production Edge entry after the guarded SQL/history deployment. It verifies source/JWT checks without configuring Secrets or allocating a second budget. `deploy/transport.mjs` shares credential-free, bounded read-only transport recovery between the isolated clients.

`hosted-ai/activate-production.mjs` separately freezes settled development admissions before allocating the original shared remainder to production. It requires owner-confirmed Secrets, verifies source/history/JWT, preserves fees, and records resumable activation evidence without model calls.

`hosted-ai/acceptance-target.mjs` binds manual Auth/live/receipt runners to an explicit environment, isolated private session and evidence prefix. Production runs retain their original actions and fees; partial receipt checks report missing capability acceptance explicitly.

`hosted-ai/content-rollout.mjs` provides explicit environment audit/pause/migrate/enable with existing-budget preservation. `hosted-ai/schema-state.mjs` verifies standalone hosted RPC source without inventing core migration history. `hosted-ai/content-minimization/` contains metadata-only privacy controls and the affected feature runner. Production activation from the older allocation script is retired for this rollout.

`billing/` contains isolated D0 SQL/HTTP acceptance, scoped fixture recovery, test-only Stripe catalog/notification preparation and guarded development billing schema deployment. Real provider setup and controlled lifecycle evidence are distinct. These tools never invoke models, charge a live payment, change Apple configuration or activate production billing. See [billing tooling](billing/README.md).
