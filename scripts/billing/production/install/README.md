# Bounded production installation

INPUT: Current reviewed source, exact production metadata, an immutable inspection hash and explicit owner-only runtime config.
OUTPUT: One-shot stage intents and independent readbacks, bounded minute worker SQL and read-only health reports.
POS: BILL-29 installation only. The parent coordinates cloud maintenance, lifecycle/provider verification and activation.

[PROTOCOL]: Update this header when making changes, then check README.md.

`failure-cases.md` precedes implementation. `source.mjs` fixes production identity, source/dependency closure, six JWT modes and transaction SQL. `client.mjs` uses only the existing `.env.deploy.production.local`, with finite errors and no replay; Auth lifetime inspection permits only GET. `io.mjs` protects private files and durable immutable intents. `runtime.mjs` is pure production config validation shared by installation and private custody. `run.mjs` owns stages and observed postconditions. `cli.mjs` is the staged deployment entry. [operations/](operations/README.md) contains local durable config custody, limited negative gateway checks and post-install recovery inspection/SQL preparation; preparation never deploys or activates service. `acceptance.mjs` exercises the actual CLI/HTTP boundary with controlled Management responses. `postgres.mjs` prepares the exact0033 rollback/grammar material; its development execution requires a separately granted parent lease. `acceptance-postgres.mjs` uses the already prepared dedicated local Docker runtime and the lifecycle module's actual isolation guard/initializer to execute exact migrations, job creation and0033 rollback in its own disposable container. These reports do not attest production installation.

```sh
node scripts/billing/production/install/acceptance.mjs
node scripts/billing/production/install/acceptance.mjs --private-readback
node scripts/billing/production/install/acceptance-postgres.mjs
node scripts/billing/production/install/postgres.mjs --grammar <saved-production-inspection.json>
```

The local PostgreSQL runner never pulls images or starts/changes a daemon/context. It requires the existing `bill29` Unix socket and prepared volume-free PostgreSQL17 image. Every SQL call rechecks the same container/image/process identity, `network=none`, read-only root, the three allowed tmpfs paths, no ports/host mounts, non-root user, no added capabilities and bounded memory/processes. Only its exact owned container is removed. Minimal local Auth/Storage/Realtime schema ports support migration compilation; no service containers run. Real pg_net/pg_cron/Vault extensions are used, and HTTP work is never dispatched. Thus this proves local SQL installation/observations, not hosted Auth/gateway/provider acceptance.

From the repository root:

```sh
node scripts/billing/production/install/cli.mjs --plan output/tests/billing/desktop/bill29-execution/install-v1
node scripts/billing/production/install/cli.mjs --inspect output/tests/billing/desktop/bill29-execution/install-v1
```

Planning does not read credentials or use the network. Inspection is read-only and writes a unique `inspection-<uuid>.json`, its generated exact SQL, and a `reviewedHash`. Source, artifact, plan and inspection hashes are rechecked before credentials. Review that exact material before using `--apply`; source changes require a new plan. Unknown outcomes use `--check` with the **same** stage, baseline, reviewed hash and config. Each stage has one durable intent; a second `--apply` refuses even if a prior response was lost. No automatic replay, lease clearing, unpause, reverse migration or general recovery framework exists.

The schema stage appends original0014–0032 and private operations0033 in one transaction, rebinds the closed newly created0018 policy to production before0025 backfill, preserves original AI accounting/protection/budget/policy and leaves all six readiness/source flags closed. The caller must supply `--maintenance coordinated-cloud-cutover`:0018 stops current1.9.10 sync; later cloud/generation contracts and Edge transports also require the new client. This flag records a coordinated maintenance decision; it is not proof that traffic drained. Database locks, active-work checks and fresh protected-state guards still apply. AI is never switched to `trial_or_paid` by this tool.

```sh
node scripts/billing/production/install/cli.mjs --apply <directory> --stage schema --baseline <inspection.json> --reviewed <hash> --maintenance coordinated-cloud-cutover
node scripts/billing/production/install/cli.mjs --apply <directory> --stage secrets --baseline <inspection.json> --reviewed <hash> --config <private-production-env>
node scripts/billing/production/install/cli.mjs --apply <directory> --stage vault --baseline <inspection.json> --reviewed <hash> --config <private-production-env>
node scripts/billing/production/install/cli.mjs --apply <directory> --stage edge:billing --baseline <inspection.json> --reviewed <hash>
node scripts/billing/production/install/cli.mjs --apply <directory> --stage jobs --baseline <inspection.json> --reviewed <hash>
node scripts/billing/production/install/cli.mjs --check <directory> --stage schema --baseline <inspection.json> --reviewed <hash>
node scripts/billing/production/install/cli.mjs --health
```

Deploy the other five explicit `edge:<slug>` stages separately. Lifecycle gateway mode is false because its opaque worker Bearer is not a JWT; its handler retains verified Auth for every user route and exact secret validation for workers. Parent must review the lifecycle developer's focused auth regression and actual gateway rejection/readback. Billing/deletion-receipt use manual authentication; the other three retain gateway JWT. JWT metadata/source hashes alone do not establish actual authentication acceptance.

The explicit runtime env contains `SUPABASE_PROJECT_REF`, the eleven billing/lifecycle names from the sibling package and optional `SNAPSHOT_PRODUCER_SHA256` (derived from the exact deployed snapshot bundle). A live **restricted** Stripe key is required; Test/general secret keys are refused. Automatic Tax remains false because tax work is deferred. Values stay out of plans/logs/reports. Existing differing remote Secrets are refused unless the exact set of names is supplied with repeated `--replace-secret`; unrelated metadata must remain equal. Vault/source binding is a separate atomic stage, with a disabled source and two distinct Vault references. Neither a supplied config nor installed source establishes actual Live/ledger readiness.

Vault digest readback uses the same existing operator credential with SQL `BEGIN READ ONLY`; the Management API's separate read-only role cannot decrypt Vault. The query returns only the two names and SHA-256 digests. No ACL or deployment behavior changes. `--private-readback` runs only the existing CLI's focused Vault/health scenarios with synthetic credentials and loopback HTTP, including denied-role recovery, refusal to replay the original write and preserved non-green health alerts.

Three minute jobs are installed **inactive**. The two workers dispatch bounded HTTP calls using Vault Authorization references. The third attributes exact `request_id` responses, retains finite counters/outcomes for14 days and runs existing bounded retention cleanup only after actual lifecycle readiness and outside a restore barrier. It never erases supplier backups. The original runtime cleanup job remains unchanged. An endpoint HTTP200 with retry/pending work remains visible; an enqueued request is never counted as a completed invocation. Observation records no raw response body, task, provider payload or credential.

Supabase documents that [pg_net starts requests after commit](https://supabase.com/docs/guides/database/extensions/pg_net), and that [queued headers are readable by trusted database login roles](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net). Vault protects storage at rest, not the decrypted queue header. Inspection/job preparation checks that `net`, `vault` and `service_private` are absent from exposed Data API schemas; existing database operator access remains trusted. Do not claim unsupported extension ACL revocations hide these headers.

`--health` reads actual completion freshness, HTTP failures, unresolved work, original72-hour overdue grace, compensation and deletion deadline risk. It exits nonzero for actionable states and records a unique private report. A separately scheduled invocation can detect project/cron outage; no paid monitor or new external heartbeat launch prerequisite is introduced. The5-minute freshness/24-hour deletion risk thresholds are operational alert thresholds, not extensions to product deadlines. Actual Stripe dunning settings/`next_payment_attempt` require the Live provider owner's independent readback; health never claims retry alignment from app cutoff.

The private health function uses the same existing operator with SQL `BEGIN READ ONLY` because the Management API's read-only role cannot execute it. Ordinary cron metadata queries retain the API read-only role. This changes no ACL, health threshold or alert; paused jobs and observed Billing failures remain non-green.

Preparation has no enable/readiness/launch command. Parent must coordinate a bounded active-worker observation window and actual signed deliveries/ledger/gateway evidence before opening service. `pause` changes only these three exact new jobs; it does not resolve privacy deadlines or reset data. See the ignored `installer-plan.md` for old-client impact and recovery. Existing D0–D3, desktop E2E, full verify and stress suites are outside this tool's changed scope.
