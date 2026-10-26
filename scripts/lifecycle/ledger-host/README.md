# Independent deletion ledger

INPUT: Fixed environment, owner-selected store UUID and private 32-byte hex `LEDGER_TOKEN`.
OUTPUT: Four authenticated metadata-only POST actions matching the lifecycle `httpLedger` port.
POS: Independent Cloudflare SQLite Durable Object. Supabase business backups never restore this store.

[PROTOCOL]: Update this header when making changes, then check README.md.

`worker.ts` owns authentication, bounded validation, fixed identity, append-only SQL transactions and bigint-safe contiguous reads. One permanent object name survives configuration changes; a changed store ID/environment is refused against the original identity. SQL triggers reject updates/deletes. No admin/reset/rollback API is exposed. Cloudflare account administrators can still change code or restore storage; protect that control plane and never use PITR to roll the ledger back.

`wrangler.jsonc` defines one SQLite class on Workers Free. Set `STORE_ID` explicitly before first deploy and supply `LEDGER_TOKEN` via Wrangler secret input. Tokens never belong in source. The deployment script pins the authorized account ID as an authority guard; runtime URLs/credentials are discovered and saved privately. Do not add custom domains or upgrade the plan. Free quota exhaustion fails closed. Cloudflare [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) confirms SQLite Durable Objects on Free; this does not promise unlimited capacity or a backup SLA.

`deploy.mjs` is the bounded, explicitly authorized two-host installer. It accepts an owner-only short-lived credential file, fixed account and exactly the acceptance/production names. It freezes reviewed bundle bytes, saves private runtime identities before dispatch, resolves original deployment outcomes by readback and never repeats an attempted creation. Deployed settings/module bytes must match. Acceptance appends/redeployment use the separate store; production receives head/identity and missing-token checks only. Reports contain metadata and credential paths, never tokens. Unknown failures retain the original journal/event IDs. No import or test automatically runs this installer.

Local acceptance uses actual workerd/SQLite via Miniflare and persistent temporary state. Tooling is installed in `/private/tmp/goalloom-ledger-runtime`, outside the desktop dependency tree: Wrangler 4.152.0, Miniflare 4.20260730.0, Workers types 5.20261025.1. Run `node scripts/lifecycle/ledger-host/acceptance.mjs`. Evidence goes to `output/tests/billing/desktop/bill29-execution/ledger-host/`. No real account or credentials are loaded by that command.

Deployment remains an explicit reviewed operation. Use a separate disposable acceptance Worker/store for destructive/failure probes; never append synthetic identities to the production ledger. Production verification starts with authenticated empty-head read and missing/wrong-token denial. First business append must use an actual accepted lifecycle event.
