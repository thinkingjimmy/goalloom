# Private configuration, gateway checks and recovery preparation

INPUT: Explicit private runtime handoffs, exact reviewed source and closed production metadata.
OUTPUT: Durable owner-only configuration, twelve bounded authentication/signature denials, or read-only recovery facts and bounded SQL preparation.
POS: Focused BILL-29 operator helpers. No deployment, key generation, valid business mutation, provider/model call or service activation by preparation.

[PROTOCOL]: Update this header when making changes, then check README.md.

Failures are in `failure-cases.md`. `persist-config.mjs` merges only runtime names from explicit private files. It uses the same pure `../runtime.mjs` validation as the installer. The destination is fixed at `/Users/jimmywong/Documents/goalloom/.env.billing.production.local`; it must be ignored, regular, owned by the current user and exactly0600. New files use exclusive creation plus file/directory fsync, followed by private value-by-value readback. Identical existing config is idempotent. Differing/unsafe files are refused without overwrite/chmod. Operator fields are excluded, source conflicts and incomplete/Test configuration fail, and no input file is deleted.

```sh
node scripts/billing/production/install/operations/persist-config.mjs --save --source <private-provider-runtime.env> --source <private-ledger.env>
node scripts/billing/production/install/operations/persist-config.mjs --verify
```

Wait for root's actual private handoff paths and complete fields. This helper does not create missing Stripe, RevenueCat, webhook or worker credentials. It derives only the exact reviewed snapshot digest. It prints path/count/mode/match booleans, never values. Temporary inputs remain until root separately confirms durable custody and authorizes their cleanup. Missing credentials do not permit a partial durable target or a production upload.

`gateway.mjs` prepares a credential-free exact plan, then an explicitly reviewed run reads fixed production metadata and sends twelve negative requests. It checks closed gates, empty work and exact installed migration/JWT metadata first. Manual-auth routes require their exact handler error, so a generic gateway401 cannot substitute for lifecycle/user/worker handler validation. Other three JWT-gated routes require401. The fake JWT has an invalid signature; workers receive only an invalid literal bearer; HMAC headers are invalid/expired; receipt body has no authority. No valid user, callback, worker or receipt is used. This is gateway rejection evidence, not provider/ledger/business-worker acceptance or source-byte attestation.

```sh
node scripts/billing/production/install/operations/gateway.mjs --plan <reviewed-installation-directory>
node scripts/billing/production/install/operations/gateway.mjs --run <gateway-plan.json> --reviewed <hash>
```

The run has a shared45-second probe budget, per-request8-second limit,4KiB response cap, no redirects/retries and finite result fields. It privately reads protected-state hashes again; unexpected change remains unresolved and is never reverted. It loads only the existing production Management credential for metadata/read-only queries, not runtime keys. No deployment or production run is part of preparation.

Run the negative gateway checks in the existing coordinated installation window. Normal empty-queue business-worker200 and actual signed callbacks can share the later source-enabled window; these helpers add no extra framework or launch gate. Closed canary billing503 remains the expected closed-path result. The already accepted local PostgreSQL/schema tests are not repeated by these helpers, and no VM is started.

`acceptance.mjs` runs real child processes and loopback HTTP with synthetic credentials and an isolated filesystem mapping for the fixed destination. It never creates a synthetic `.env.billing.production.local` in the actual checkout, reads real credentials or calls production/provider services.

`recovery.mjs` reads the current installed state without loading or rewriting an old installation plan. It verifies33 exact migration statements/private fingerprints, six downloaded Edge bundles/JWT modes, private schema exclusion, actual Auth JWT lifetime, original work aggregates, preserved owner facts and exact jobs. The Auth config response remains in memory; reports retain only `jwt_exp`. SQL uses the existing operator with `BEGIN READ ONLY`. Inspection does not observe original expired JWTs/sockets/Storage URLs and never sets transfer-drain readiness.

```sh
node scripts/billing/production/install/operations/recovery.mjs --inspect
node scripts/billing/production/install/operations/recovery.mjs --plan <new-inspection.json> --output output/tests/billing/desktop/bill29-continuation/backend/<new-window-directory>
node scripts/billing/production/install/operations/recovery-acceptance.mjs
```

The second command is offline. It refuses changed source/history, open/drifted policies, pending/unknown work and changed job commands. It emits immutable `plan.json`, inspection, `arm.sql`, `restore.sql`, `finalize.sql` and `read.sql`. The plan includes exact hashes and the original arm transaction identity. It does not execute SQL. Root must review the actual exposure, record one durable SQL-hash intent, then dispatch exactly one `POST /database/query` with the reviewed SQL and `read_only:false`. Lost responses require the original transaction/job/request readback; never replay arm. Original installation plans, evidence and freezes remain historical.

**This window opens authenticated billing APIs.** Both `billing_policy.enabled` and the existing production Stripe source must be true for `billing_source` to let workers/receivers proceed. The same flags permit authenticated billing status, trial, Checkout, Portal and subscription actions. Ordinary cloud, hosted AI admission, all four lifecycle flags, restore admission and public website purchase gates stay closed. A closed website does not close its authenticated backend. Root must align authorization for this exact temporary exposure before dispatch. No runtime flag, handler modification, migration, new credential or provider fixture is introduced to simplify testing.

Review the generator first; take a fresh inspection and prepare just before dispatch. Arm expires two minutes after inspection. The three existing jobs embed an absolute dispatch deadline five minutes after inspection; HTTP admission remains open until an actual cron/manual close commits. Each resumed job checks expiry before dispatch. At expiry, closed-policy drift or newly actionable work, each job closes only source/billing policy and restores/pauses its own exact command. A missed cron run cannot dispatch after expiry when resumed; a project/cron outage can delay closing the flags themselves, so Root must use `restore.sql` if timely closure is needed. A timer does not independently disable HTTP ingress. Do not claim a hard five-minute HTTP admission lease. There is no fourth job/controller/schema. Each empty Billing call makes four actual configured Stripe GETs; a real event arriving between the SQL check and worker claim can cause normal reconciliation. Never claim this asynchronous window guarantees no business work under concurrent ingress.

`restore.sql` accepts mixed exact original/this-window job commands, closes the two owned flags and restores/pauses all three. Foreign command or binding drift refuses without overwriting it. `read.sql` is SQL read-only and returns finite exact request/response metadata, never response bodies. After closure and actual request completion, `finalize.sql` invokes the existing observer only with all lifecycle flags closed; product retention remains skipped. A new read must confirm completed request IDs, actual HTTP200/counters, empty/unresolved queues, exact paused commands, unchanged owner/AI facts and original cleanup job. Queuing an HTTP request or an HTTP200 with retry/pending counters is not successful business-worker acceptance. Preserve all historical503/canceled cron results.

See `recovery-failure-cases.md` for the pre-implementation failure contract. This local CLI/HTTP acceptance does not execute generated SQL in PostgreSQL and does not establish production worker success, legacy natural expiry, signed provider delivery, service reopening or packaged-desktop acceptance.

`recovery-postgres.mjs` is the separate focused SQL acceptance requested by Root review. It uses only the prepared `bill29` image/socket and the existing recovery isolation guard. Exact migrations are disposable fixture setup, not a rerun of original installer31/rollback18 acceptance. It executes arm/refusal/restore/finalize/read SQL, verifies TEST ignored and pending-row preservation, checks whole-query versus substring `current_query()` behavior, and schedules one already-expired observer wrapper through real pg_cron. The report records actual cron status/message plus committed final flags and commands. It never invokes a worker HTTP dispatch or requires a Vault credential. The fixture keeps ordinary cron launching off until the single expired scheduling case; no network/ports/host mounts/image pull are used. Any failed fixture report remains intact.

```sh
node scripts/billing/production/install/operations/recovery-postgres.mjs
```

Root selected the smallest combined production acceptance: empty workers plus one existing RC Dashboard TEST. Both Stripe endpoints stay disabled throughout; Live Stripe has no existing event to resend, so temporary enable/disable adds no delivery evidence. Their already authorized activation waits for continuous receiver readiness. No Stripe financial fixture is created.

The original production arm failed before commit because the hosted non-superuser postgres role has only SELECT on supabase_admin-owned cron.job. The original isolated13-case fixture used a superuser and did not represent this boundary. `cron-api-production-readback.json` records hosted pg_cron1.6.4 and actual API execute privilege. Its upstream [AlterJob implementation](https://github.com/citusdata/pg_cron/blob/v1.6.4/src/job_metadata.c) rejects all-NULL optional parameters, so the API is not used as a fictitious no-op row lock.

The corrected generator directly locks only its four owned policy/source tables and retains the existing advisory lock, exact job checks and lawful cron API calls. Root approved this bounded operation with one cron writer. Exact guards reject observed drift; advisory locking serializes participating operators. An independent administrator bypassing this coordination can race the job check/API write. The package explicitly states this limit; it does not promise serialization of arbitrary external cron editors. No production grant, new RPC/function/schema or isolation-level change is added. Failed/expired v1/v2 packages and their original intents remain immutable and must not be replayed.

```sh
node scripts/billing/production/install/operations/recovery-postgres.mjs --role-lock
```

This selector uses `recovery-role-acceptance.mjs` and only the new non-superuser/SELECT-only cases. It proves the original direct-lock refusal, all-NULL API refusal, unchanged failed-call metadata, corrected arm/restore, observed command-drift rejection, expired wrappers, finalize/read and one actual expired cron run under the restricted owner. Application-schema migration load is fixture setup. Accepted13/22/9 suites are reused and not rerun by this selector. Root must review the corrected generator hash and new role evidence before dispatching another fresh window; v2's failed original arm is never replayed.

## Continuous recovery preparation

`reopen-failure-cases.md` records the failure contract before implementation. `reopen.mjs` reuses the current read-only inspector and accepted ledger/isolated-restore/key-custody/worker evidence. It privately verifies the original key, records exact evidence/source hashes, and emits separate `billing.sql`, `service.sql`, `close.sql` and read-only `read.sql`. There is no apply mode or production mutation during preparation. Evidence is reused, not rerun; unavailable historical JWT/URL samples are not a new gate and elapsed time never proves physical upload completion.

```sh
NODE_USE_ENV_PROXY=1 node scripts/billing/production/install/operations/reopen.mjs --inspect
node scripts/billing/production/install/operations/reopen.mjs --plan <new-inspection.json> --output output/tests/billing/desktop/bill29-reopen/backend/<new-package>
node scripts/billing/production/install/operations/recovery-postgres.mjs --reopen
node scripts/billing/production/install/operations/reopen-acceptance.mjs <current-inspection.json>
```

The first transaction continuously opens Billing/source and activates the three exact minute jobs. Those gates expose authenticated trial, Checkout, Portal and subscription APIs. The service transaction separately sets the four lifecycle flags from the accepted limited evidence, binds the actual enabled `billing_source()` using PostgreSQL JSONB/text MD5, and enables version2 cloud admission. Parent has directed the same transaction to change only AI policy `authenticated` to `trial_or_paid`; all budget amounts, costs, blocked/protection fields remain. Version1 AI now also requires current bound trial/paid eligibility. Closing service retains this paid-qualification rule. This is a real service/cleanup exposure package, not a business dry run or a public-sale decision.

Only the same old owner is blocked by its retained/unverified original cloud generation. A different owner is not blocked. Global switches/trial cannot create its missing ordinary-expiry boundary. Preserve its original cloud objects and local workspace; account-only login is available, but existing product transactions do not non-destructively enroll that legacy generation. The distinct explicit `create_new_workspace` transaction can create a supported new cloud copy from the current local workspace without deleting the old generation, when this subject has no incomplete initialization (production aggregate: zero). The client already has a preview/confirmation path selecting that transaction, but the signed candidate does not expose its entry for this legacy retained case. This scoped UI limitation is separate from global service restoration. Do not set a fictitious old boundary, use destructive reset, recreate an account or make this legacy case a global permanent launch gate.

Fresh exact readback and one sole cron writer remain required. Stage intents identify exact SQL hashes before a single dispatch; ambiguous outcomes use readback, never automatic replay. `close.sql` pauses only exact owned jobs, closes owned admission/readiness, preserves receipts/unknown outcomes and refuses foreign binding/job drift or an active restore barrier. It does not cancel accepted requests. Existing `--health` plus `read.sql` must show actual recurring worker responses/counters and fresh observer after execution. Outages require the explicit close path; this continuous plan has no expiry wrapper or false timer guarantee. Source inspection is five-minute bounded for activation, so a saved review package must be regenerated from fresh inspection before execution.

`reopen-postgres-cases.mjs` is selected only by the existing runner's `--reopen` option. It uses a non-superuser/BYPASSRLS application owner, matching actual hosted metadata, with SELECT-only cron.job. It proves actual signed explicit-new creation preserves the old generation, alongside source binding, closure, drift refusal and AI qualification. Fixture Auth/workspace inserts use the local administrator; the recovery transactions use the restricted operator. Cron launching stays off and no HTTP dispatch or model request occurs. `reopen-acceptance.mjs` invokes actual CLI child processes against a saved inspection; a preloader denies fetch and private-config reads. It retains all package/tamper/error artifacts and reports exact source/SQL hashes. These checks are not continuous-production or signed-client acceptance.
