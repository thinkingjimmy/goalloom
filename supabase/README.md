# Hosted Supabase (phase 0)

The desktop and mobile clients, and the shared packages under `packages/`, stay MIT ([`LICENSE`](../LICENSE)). Everything in this directory is GNU AGPL-3.0-only ([`LICENSE`](./LICENSE)): migrations, RPCs, Edge Functions, pgTAP, `reset.sql`, and `config.toml`. Client packages do not import this tree.

D0 billing uses private account trials, verified Stripe invoice facts and RevenueCat recognition; it does not create `public.entitlements` or authorize from a webhook's aggregate flag. Development D1 migrations `0018`–`0024` replace the legacy permissive `sync_entitled` fallback, wrap ordinary cloud RPCs behind private proof implementations, add fee-admission checks and persist finite browser continuations plus immutable cross-device operation aliases. These changes are installed only in development; production retains its earlier source/configuration. See the staged evidence under `output/tests/billing/desktop/d1-backend/`. Legacy capability drain and browser/native acceptance remain separate gates. D2 owns retrieval/deletion and D3 owns production rollout. Desktop Stripe comes first. Apple transaction authorization remains deferred to mobile, with its existing provider configuration preserved.

Security of the hosted service is end-to-end encryption plus secrets kept in the environment. Hiding this source is not a control. Do not commit database URLs, anon keys, service-role keys, or access tokens. The project ref below names the dev project; it is not a credential.

Project ref `asqyvcnxdltzzfutbbqy`. Migrations and tests run against that hosted database. Nothing in this folder starts Docker.

## Production deployment

Production is the separate Tokyo project `keqprrgvcefqdwnxaafv` (`https://keqprrgvcefqdwnxaafv.supabase.co`). The development project above remains unchanged. Production uses the default Supabase domain on the existing Free plan; do not enable a custom domain or upgrade billing as part of deployment.

The manual entry is [`scripts/deploy/supabase.mjs`](../scripts/deploy/README.md). It reads only the ignored `.env.deploy.production.local`, verifies the exact production ref and private file permissions, and never falls back to development credentials. Grant its scoped token Database, Edge Functions and Realtime Config read/read-write, plus Project Settings and Auth Config read. It does not fetch API key secrets or change Google provider credentials.

```sh
node scripts/deploy/supabase.mjs --plan
node scripts/deploy/supabase.mjs --check
node scripts/deploy/supabase.mjs --apply
```

The production schema and SQL text are recorded atomically in `supabase_migrations.schema_migrations`. Already-applied SQL must match the repository exactly. A new run refuses unknown history or existing sync tables without a baseline; it never resets or rebuilds an existing production database. Concurrent history changes stop the transaction. The existing 47 core/cost and 27 security assertions run with real pgsodium in rolled-back transactions before deployment and again against the installed schema. Test fixtures do not persist.

Deployment also enforces private-only Realtime, verifies downloaded `snapshot-url` source with JWT checks enabled, installs one five-minute bounded cleanup job and checks that an unauthenticated Edge request returns 401. Per-run reports are under ignored `apps/desktop/output/tests/production-environment/`. A network timeout is not proof that a write failed: inspect remote history, function source and cron inventory before explicitly resuming.

Google sign-in uses the official website as Site URL and allows the current desktop callback `http://127.0.0.1:53682/callback`. Backend deployment does not switch installed clients, migrate personal workspaces, publish installers or prove a real Google/two-device journey. Those remain the next client-isolation milestone.

## Local deployment credentials

Create a scoped token in [Supabase Access Tokens](https://supabase.com/dashboard/account/tokens), limited to this project, with an expiry. Grant **Edge Functions: Read and Read-write** for function deployment. Add **Database: Read and Read-write** only for SQL through the Management API. See the official [permission table](https://supabase.com/docs/guides/platform/personal-access-tokens#permission-scopes).

Create the local file from the repository root, then fill it in with a local editor:

```sh
umask 077
touch .env.deploy.local
chmod 600 .env.deploy.local
open -e .env.deploy.local
```

```sh
SUPABASE_ACCESS_TOKEN='replace-with-your-scoped-token'
SUPABASE_PROJECT_REF='asqyvcnxdltzzfutbbqy'
SUPABASE_DB_URL='postgresql://...'
```

The token authenticates CLI / Management API deployments. `SUPABASE_DB_URL` is optional for token-only deployment; `psql` and database tests need it. Copy the URI from the project's **Connect** dialog, use the existing database password, and require SSL. Use the session pooler when the machine cannot reach the direct IPv6 address. URL-encode special characters in the password.

Load the file only in the shell used for deployment:

```sh
set -a
source .env.deploy.local
set +a
supabase functions list --project-ref "$SUPABASE_PROJECT_REF"
```

Install the CLI with the [official macOS instructions](https://supabase.com/docs/guides/local-development/cli/getting-started) if needed (`brew install supabase/tap/supabase`). The [CLI accepts `SUPABASE_ACCESS_TOKEN`](https://supabase.com/docs/reference/cli/introduction#supabase-login), so no browser login or saved CLI token is needed. Deploy the checked-in function with:

```sh
supabase functions deploy snapshot-url --project-ref "$SUPABASE_PROJECT_REF" --use-api
```

`.gitignore` excludes `.env.deploy.local`; verify with `git check-ignore .env.deploy.local`. Keep it out of app builds, screenshots and chat. The file has private permissions but is not encrypted. Revoke the token in Supabase when it expires or is no longer needed. Publishable/anon keys and service-role keys do not replace this deployment token.

Hosted API integration tests separately require:

```sh
export SUPABASE_URL='https://asqyvcnxdltzzfutbbqy.supabase.co'
export SUPABASE_ANON_KEY='...'
export SUPABASE_SERVICE_ROLE_KEY='...'
```

`SUPABASE_DB_URL` is the Postgres URI (Settings → Database). `supabase test db` and `psql` both use it. The Node script uses the three API variables and never reads the database password.

## Migrations

The existing hosted project was deployed through SQL, without CLI migration history. Apply reviewed pending definitions with `psql` or the Management API. Do not replay `0001` through `0009` with `db push` on that project. Establish and verify a matching migration-history baseline before using CLI-managed schema deployments.

For a new project, from the repository root with the [Supabase CLI](https://supabase.com/docs/guides/cli) authenticated:

```sh
supabase link --project-ref asqyvcnxdltzzfutbbqy
supabase db push --db-url "$SUPABASE_DB_URL"
```

`supabase db push` after a successful link (no `--db-url`) is the same apply. `--db-url` does not need the link and does not need Docker.

The migration enables `pgsodium` when it is not already installed. Hosted projects already have it. `_ed25519_verify` calls `pgsodium.crypto_sign_verify_detached` and raises `42501` if that function is missing. On the hosted project that call is granted: the noble fixture at the start of the pgTAP file verifies. `pgsodium.crypto_sign_new_keypair` is not granted to `postgres` (`42501`). Tests sign with noble (`node scripts/gen-ed25519-fixtures.mjs`) and do not generate keys in SQL. Verification stays in Postgres. Move it to an Edge Function only if a future project also revokes `crypto_sign_verify_detached`.

`supabase/migrations/0002_cleanup.sql` is the delta for a database that already applied `0001_core.sql`: device foreign keys cascade, and `realtime.messages` gets the insert policy. `supabase/migrations/0003_roster_signature.sql` replaces `bootstrap_workspace` so the roster signature is checked over SHA-256 of `goalloom/roster/v1|` plus canonical JSON. Apply a delta through the Management API SQL endpoint, or:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_cleanup.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_roster_signature.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_roster_signers.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_desktop_client.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_envelope_ambiguity.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0007_reset_sync.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0008_sync_cost.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0009_sync_security.sql
```

`0004_roster_signers.sql` depends on `_roster_message` from `0003`. `commit_roster` and `rotate_epoch` then accept only the calling device's authorized signing key. `complete_recovery` accepts only the current roster's `recoverySignPub`. A mismatch raises `roster_signature_rejected` (`42501`).

`0005_desktop_client.sql` is the desktop client delta. It adds `linux` to `devices.platform`, plus `list_account`, `get_roster`, `get_key_envelopes` and `put_key_envelopes`. It does not change `sync_entitled`. The desktop app does not deploy it. Apply it to the dev project before a Linux client can call `register_device`, and before any client can discover a workspace or store key envelopes.

`0006_envelope_ambiguity.sql` replaces `put_key_envelopes` and `push_ops` on a database that already applied `0005`. The `0005` function declares `epoch`, `recipient`, `signature` and `roster_version`, which are also columns, so the first envelope insert raises `42702` under the default `plpgsql.variable_conflict`. `0006` prefixes those variables. It also raises the per-op ciphertext cap from 64 KiB to the existing 1 MiB batch cap so a long description can sync. Apply `0006` to the dev project before enabling sync. The client does not deploy it.

`0007_reset_sync.sql` adds `reset_sync(uuid)`. A forgotten sync password cannot open the recovery lock, so this deletes the account’s workspace and the device that still has the local board uploads a new one. It does not change `sync_entitled`. The client does not deploy it. Apply it before using Reset sync. A phrase-era envelope is not migrated.

## pgTAP

`pgtap` has to be available once. The CLI installs it for `supabase test db`. For `psql`, create it first:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "create extension if not exists pgtap with schema extensions;"
```

Then either:

```sh
supabase test db --db-url "$SUPABASE_DB_URL"
```

or:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0001_core.test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0002_sync_security.test.sql
node scripts/pg-sync-test.mjs
```

`supabase test db` picks up `0001_core.test.sql` and `0002_sync_security.test.sql`. Both roll back. Shared auth helpers live in `auth-fixtures.sql`; signed recovery proofs in `sync-security-fixtures.sql` are generated by `node scripts/gen-sync-security-fixtures.mjs` (`--check` verifies committed bytes). Cases 1, 4, 16 and 17 use real `auth.users` / `auth.sessions` rows and `request.jwt.claims`. Case 16 pins the recovery nonce and checks a noble signature from `scripts/gen-ed25519-fixtures.mjs`. There is no sha256 oracle and no pgsodium key generation.

`realtime_can_read` covers an authorized device, a foreign topic, a revoked device, and a deleted `auth.sessions` row. The `ws topic read` and `ws topic write` policies on `realtime.messages` are asserted when that table exists. An already-open Realtime socket is not something pgTAP can drop; the Node script covers resubscribe.

## Edge function

Deploy after the migration. The hosted runtime injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not put them in the function source.

```sh
supabase functions deploy snapshot-url --project-ref asqyvcnxdltzzfutbbqy
```

The historical signing handler issued reusable Storage URLs. Current D2 development uses the bounded binary GET/PUT proxy described in [snapshot transport](functions/snapshot-url/README.md), with service header 2, exact generation/sequence/path fences and no client Storage credentials. Deploy only through the reviewed source-bound installer; the standalone command above is historical setup guidance. Legacy signed-token retirement is separate from proxy installation.

## Realtime, Storage and JWT

```sh
node scripts/supabase-remote.mjs
```

Requires Node.js 22 or newer (native `WebSocket`; `package.json` `engines` is `>=22.12.0`), plus `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The script creates a user `p0-<uuid>@goalloom.test` through the admin API, signs in twice so two devices have different sessions, uploads a real snapshot object, and deletes that user in a `finally` block. Google and Apple OAuth are not used.

It checks:

- `register_device` reads `session_id` from the access token
- `push_ops` accepts an authorized device and rejects it after `revoke_device`
- a second authorized device on its own session subscribes to the private channel and receives the `realtime.send` head broadcast from the first device's `push_ops`
- an unauthorized client does not reach `SUBSCRIBED` on that private channel
- a subscribe with `private: false` does not reach `SUBSCRIBED`
- the first device's private channel subscribes with `broadcast.self: true`, receives its own broadcast, keeps one broadcast after revoke, and fails the next subscribe
- `snapshot_access` rejects a foreign path and accepts a published object
- `snapshot-url` returns 404 when the object is missing, then a signed download URL after the upload, a signed upload URL, and 403 for a foreign path

The "existing connection still receives" check waits up to 8 seconds. Resubscribe must be rejected.

Private channels need the select and insert policies from `0002_cleanup.sql`. A client that omits `broadcast.self` gets `send=ok` and `seen=0`, because Realtime does not echo a broadcast to its sender.

The hosted Realtime Settings page does not have a "Broadcast from database" control. `push_ops` calls `realtime.send` on the private topic `ws:<workspace>`. The script checks that a second authorized device receives that head broadcast within 8 seconds. Set **Allow public access to channels** to off. That is the required manual project setting. With it off, an unauthorized client and a subscribe with `private: false` must not reach `SUBSCRIBED`. The head broadcast and those two rejections wait up to 8 seconds each.

## Dual-end prototype

Six scenarios, two Electron SQLite clients, no OAuth. The script creates `p0-proto-<uuid>@goalloom.test` with the admin API and deletes that user afterwards. It needs the same three API variables as `scripts/supabase-remote.mjs`. It does not need `SUPABASE_DB_URL`.

```sh
pnpm test:phase0
```

The scenarios are offline edit, reorder, conflict reject, crash recovery, key rotation (`rotate_epoch`, then a stale epoch 1 push, then an epoch 2 push), and snapshot join (signed upload, signed download, install without changing generation). The same six scenarios also run locally inside `pnpm test` (`packages/tests/sync/phase0-prototype.test.ts`) and on the iOS simulator (`apps/mobile/README.md`). The simulator does not receive these keys.

`scripts/phase0-prototype.mjs` and `scripts/parity-digest.mjs` are MIT. They do not import this directory.

## Reset

Safe only on this dedicated test project. The Node script removes snapshot objects through the Storage API, deletes workspaces before devices, then deletes auth users whose email ends in `@goalloom.test`. It does not drop the database or touch any other user. Hosted Postgres rejects `DELETE` on `storage.objects`.

```sh
node scripts/supabase-reset.mjs
```

`supabase/reset.sql` is the SQL half (rows and test users, no storage):

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/reset.sql
```

Run the Node script when a remote run was killed before its `finally`, or before a clean pgTAP pass on a database that already has leftover rows. pgTAP itself rolls back. `0002_cleanup.sql` makes `auth.users` deletion cascade through device foreign keys, including `ops_device_id_fkey`.

## License

| Path | License |
|---|---|
| `apps/desktop/` (app, tests, and desktop scripts), `apps/mobile`, `packages/` (including `packages/crypto/test` and `packages/tests`), `scripts/` (including `scripts/supabase-remote.mjs` and `scripts/pg-sync-test.mjs`), `apps/website/`, `docs/`, root [`LICENSE`](../LICENSE) | MIT |
| This directory: migrations, RPCs, Edge Functions, pgTAP, `reset.sql`, `config.toml`, this README, [`LICENSE`](./LICENSE) | AGPL-3.0-only |

`@goalloom/contracts`, `@goalloom/crypto`, `@goalloom/schema`, `@goalloom/store-core`, and `@goalloom/sync` declare `"license": "MIT"` and depend only on each other plus pinned libraries (`zod`, `@noble/*`, `@scure/bip39`). Their sources do not import `supabase/`.

## Target-version cost controls

This section records the cost controls introduced by `0008`–`0009`. Current D2 development has installed forward migrations through `0032`; service/lifecycle wrappers and later push definitions take precedence. Existing data and migration history are preserved by the controlled installer. Do not rebuild or enable the database from this historical setup description. The app does not deploy or reset the database.

`0008` adds the read-only `get_sync_status`, account usage/configuration, upload-only quota, registration protection, head-change-only notifications and bounded runtime cleanup. Accepted new bytes/ops are aggregated once per batch in the same transaction as operations and receipts. Fixed-order account bucket locks serialize devices; duplicate receipts do not update accepted usage. A quota exception rolls back the whole request and carries an upload retry timestamp. Download/status/receipts remain independently accessible.

The default limit version is 1, with enforcement **off**. Observe aggregate synthetic/developer usage first. Defaults: 6,000 ops/32 MiB per minute, 200,000 ops/512 MiB per UTC day, 64 registrations per UTC day. Hosted baseline/import/long-description/concurrency checks must pass before an operator enables enforcement. These limits do not assert compute capacity or justify purchasing a larger instance.

The core pgTAP transaction includes `tests/sync-cost-cases.sql` and rolls everything back. Run it only against an isolated development database initialized with the target definitions. It checks session/device/owner guards, no per-status counter writes, duplicate receipt accounting, upload blocking with read access, account separation, and bounded cleanup preserving durable data.

After verifying `pg_cron`, inspect existing jobs before installing `sync-cost-cron.sql`. It creates/updates one named job (`goalloom-sync-runtime-cleanup`) and sets a five-second caller statement limit. Inspect `cron.job` and `cron.job_run_details` for one active job and failures; do not create a GitHub schedule. Manual cleanup callers also set `statement_timeout='5s'`. Each call deletes at most 5,000 rows in each of five indexed categories. Existing disk allocation and the bill do not automatically decrease.

On 2026-10-16, release 1.9.3 deployed the exact `0008` definition to the hosted development project (PostgreSQL 17.11, Linux x86_64). All 47 existing core/cost pgTAP assertions passed in a rolled-back transaction after correcting the synthetic cleanup payload's JSONB type. The 159 operations and 159 receipts remained intact. `pg_cron` 1.6.4 has one active five-minute cleanup job; its first scheduled run succeeded with the five-second statement limit. `snapshot-url` was redeployed, downloaded and matched to the repository byte-for-byte; JWT verification remained enabled and the unauthorized smoke returned 401.

Evidence is under ignored `apps/desktop/output/tests/release-1.9.3/backend/`: `deployment.json`, `hosted-pgtap.json`, `cron-deployment.json`, `acceptance.json`, `edge-source-validation.json` and `edge-smoke.json`. Hosted quota concurrency, capacity, successful signed Storage round trips and live multi-client broadcasts were not rerun. Enforcement remains off. No paid resources changed. Synthetic client reports under `apps/desktop/output/tests/sync-cost/` do not prove hosted capacity or a bill reduction.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Development service admission (D1)

`0018_service_admission.sql` moves existing cryptographic implementations to non-exposed `service_private`, adds versioned public admission wrappers and preserves payment-independent privacy/device proofs and exact-hash receipt recovery. Mutations lock workspace then billing account and sample current eligibility after those locks. `snapshot-url` transfers bounded ciphertext with current checks instead of issuing reusable Storage credentials. Realtime uses `cloud:v1:ws:<workspace>` and suppresses server heads after expiry; client Broadcast/Presence writes are denied.

`0019_ai_service_admission.sql` adds early and account-fenced `trial_or_paid` checks without changing existing receipts/fees or the production `authenticated` policy. Development now uses `trial_or_paid`, preserving its previous exhausted limit/spend and blocked flag; no model request or new allocation was made. `0020_billing_continuation.sql` binds finite return intent to its original operation. `0021_billing_operation_alias.sql` keeps cross-device retries bound to the original canonical Checkout, including terminal rows outside the bounded lock list.

`0022_billing_rejected_intent.sql` atomically closes only fresh incompatible billing intents with their own immutable return intent; an unresolved provider operation is never closed by this path. `0023_bounded_pull.sql` rejects NULL and out-of-range page limits before delegated ordinary reads, preserving the 200-row maximum.

`0024_billing_operation_resolution.sql` adds service-only existing-operation resolution for explicit status checks and callbacks. It validates the original finite intent and owner/session without creating an operation, alias, continuation or provider session. Missing/pending intents have no terminal receipt. Reconciliation reads current status after any existing operation transition. D2 forward migrations start at `0025`.

The staged installer uses private forward history and exact reviewed schema/Edge fingerprints. It never replays core migrations, updates production or resets a drain start for a later billing-only correction. Rollback SQL, independent transaction races, real Auth/SDK/Storage/Realtime and controlled-provider HTTP evidence have different scopes. Do not infer a completed legacy drain, packaged acceptance or public launch from deployment alone.

## Non-destructive recovery

This section records the historical `0009` behavior and its acceptance. Current D2 source supersedes newest-workspace fallback, unbounded retention and immediate reset deletion; its current implementation and remaining rollout gates are below.

`0009_sync_security.sql` follows the applied `0008` schema. `create_new_workspace` verifies a real session-bound device, entitlement, canonical roster identity/hash and device/recovery checkpoint signatures. It creates another workspace without deleting existing data. An exact signed retry is idempotent. Recovery clients generate a fresh cloud generation to satisfy the account/generation uniqueness constraint.

`list_account(p_workspace uuid default null)` returns an explicitly pinned owned workspace or, for an unbound client, the newest owned workspace by creation time/ID. An unknown/foreign explicit ID returns null and never falls through to another space. Existing devices must supply their saved ID after recovery creates a new space. There is no automatic orphan cleanup or TTL.

`reset_sync(p_device, p_workspace)` is **DESTRUCTIVE** and deletes only the explicitly selected workspace; the account-wide one-argument function is removed. Use `create_new_workspace` for forgotten passwords. Other devices and data in preserved spaces remain available.

Run `node scripts/sync-security-hosted.mjs` from the root to validate the delta and real pgTAP in one rollback-only transaction through the scoped development SQL token in `.env.deploy.local`. `--apply` installs only the reviewed delta after a passing transaction. It does not fetch API keys, use live client sessions, change billing, reset the database or deploy a packaged app. Reports are written to `apps/desktop/output/tests/sync-security/hosted.json`. The test temporarily changes entitlement behavior inside its rollback transaction; no test identity or temporary function persists.

The 27 security checks cover creation/auth/entitlement/signatures, exact retries, preserved operations/rosters/envelopes, newest/pinned/foreign discovery, old-device reads and scoped cascade deletion. Desktop source and instrumented-package acceptance use synthetic HTTP/cipher/connectivity.

`pnpm test:sync-security:live` adds production service/SDK/SQLite acceptance through real hosted Auth, HTTP/RPC and private Realtime using explicitly authorized existing anon/service-role keys. Keys remain in memory; `--browser-keys` offers a one-use loopback password form if the scoped deployment token lacks `api_gateway_keys_read`. It never creates keys or changes project permissions. The runner creates two disposable `security-…@goalloom.test` users and removes only their rows and accounts in `finally`, then verifies they are absent. No global reset or snapshot cleanup is used. Reports and a redacted client log are under `apps/desktop/output/tests/sync-security/live/`. Google provider UI, production keychain, OS network transitions and signed installer acceptance remain separate from these password-auth client sessions.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Account lifecycle (D2 development installed, acceptance in progress)

Development installed the exact `0025`–`0028` set and six reviewed Edge bundles on 2026-10-24 (Asia/Singapore). The `ef4e96e05a745b44546c` installation preserved original fields and history; independent readback verified the accepted SQL schema, source/JWT settings and unrelated Secret metadata. Later accepted installations include the `0029` push-scope correction, the `0030` snapshot-access volatility correction, retained-retrieval v3 and the targeted `0031` restore-cleanup correction. Service, billing and all lifecycle readiness flags remain closed; the billing cron is inactive. Actual development fixtures have exercised Auth/Storage PUT, production-SDK fixed-head retrieval, PostgreSQL races and lifecycle deletion/recovery. Their scoped acceptance does not complete D2. Production is unchanged. Source-bound installation evidence starts under ignored `output/tests/billing/desktop/d2-deployment/windows/ef4e96e05a745b44546c/`; later acceptance records are under ignored `output/reviews/desktop-subscription-d1-d3-2026-10-23/`.

`0025` re-keys the original billing/AI ledgers to an internal subject and uses the optional AI budget → identity creation → subject/account → sorted owned-workspace → child lock order, fixed retained boundaries, metadata discovery and creator-only exact initialization. Sync admission is 2; hosted AI explicitly remains 1. `0026` closes privacy scope immediately, records original deadlines and separate content/Auth/renewal progress, and exports deletion intent before destructive work. `0027` owns fixed-log retained retrieval. `0028` wires bounded SQL/Storage cleanup, completion outbox, finite retention cleanup and quarantined independent-ledger replay. Installing these migrations enables no readiness flag or schedule.

`0032_deleted_generation_status.sql` returns `initialization: { state: 'not_applicable' }` for every deleted generation, including after its initialization row was purged. Non-deleted generations still fail closed when a required initialization is missing. The migration changes only the private `generation_view` body and preserves its signature, owner, ACL and other wire fields. Development applied this correction on 2026-10-25 after all 21 PostgreSQL rollback scenarios passed; independent function/history readback passed and all six service flags remained closed. Actual results are under ignored `output/tests/billing/desktop/0032-direct-development/`; production was not changed.

Current `list_account` does not select a closed replacement or return empty discovery for deleted data. Ordinary expiry retains a generation for exactly 720 hours from its actual service stop, followed by 168 hours for online deletion. Explicit cloud/account deletion closes access immediately and has a 168-hour online deadline. A new generation needs a new workspace UUID, explicit creation and a reserved final operation with the original two encrypted envelopes. See [lifecycle](functions/lifecycle/README.md) and [snapshot transport](functions/snapshot-url/README.md) for actual ports, fences and configuration.

The independent development SQLite adapter proves the persistence seam only. A local worker may use real development SQL/Auth/Storage plus that adapter inside an explicit Root lease and immutable fixture scope, without a public tunnel or non-fixture claims. Production independent storage, external restore quarantine, reliable scheduling, upload producer/Storage drain bounds and supplier backup disposal remain separate launch evidence. No restored service opens automatically. The private deletion ledger now carries the minimal original receipt digest/scope/times, so recovery can reconstruct both absent and prepared-only requests without restarting deadlines; the final 3e3957 rollback passed all 129 retrieval/lifecycle/transfer/retention checks. That rollback is exact-source PostgreSQL evidence. Later actual development acceptance is recorded separately in `d2-19ff983-lifecycle-stages-review.json`, `d2-0031-rollback-acceptance.json`, `d2-0031-installation-acceptance.json` and `d2-prepared-context-actual-cleanup-acceptance.json` under the ignored review directory above. These records accept bounded lifecycle stages, the targeted 24-case rollback, installation and original-fixture cleanup/absence respectively. Current post-cleanup audit inputs, the single finalizer write/readback and the current-only full observation are accepted in `d2-prepared-context-final-audit-acceptance.json` and `d2-finalizer-current-boundary-acceptance.json`. The restore barrier is cleared, all six service/readiness flags remain closed, and no restore run/event or active scope remains at that accepted boundary. Historical preservation, original-interval usage changes and mixed foreign-data preservation gaps remain unresolved; the original full observer did not pass. These retained historical failures no longer block owner-authorized development migrations or synthetic-fixture resets. They do not establish historical preservation or production readiness. The remaining eight races passed actual PostgreSQL concurrency acceptance on 2026-10-25, with scoped fixture absence and six development flags closed. Reports are `remaining8-result.json` and `final-absence-result.json` under `output/tests/billing/desktop/d2-lifecycle/fresh-remaining8-five-resume-2026-10-25/`. D3 and production requirements remain separate. Backend `0032` rollback/installation evidence is recorded in the migration note above; its accepted scope combines actual PostgreSQL purge/status RPC checks with client HTTP-decoding and native coverage. A deployed deleted-generation HTTP response is not claimed or required from the deleted account: its original session must remain invalid. See `d2-0032-http-acceptance-scope.json` in the same ignored review directory.

`node scripts/lifecycle/typecheck.mjs`, `parse.mjs`, `acceptance.mjs` and `freeze.mjs` provide source and controlled HTTP/worker/SQLite evidence under ignored `output/tests/billing/desktop/d2-lifecycle/`. These commands do not establish hosted PostgreSQL/Auth/Storage, packaged desktop or Windows acceptance. The earlier 10-stage/73-probe real rollback applies only to its exact staged 25/26/27, not the current final 26/28.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Authenticated hosted AI (current source)

Migration `0010_hosted_ai.sql` adds service-role-only, RLS-protected actions, the shared integration budget and manual protection records. It has no sync, trial or payment dependency. New environments fail closed until their budget/policy is explicitly configured. The manual development deployment preserves the USD 10 bucket and never tops it up. `functions/hosted-ai/` bundles the desktop domain prompts and finite schemas; it verifies the project session through Auth before deriving identity. The provider key is an Edge Secret. Source protocol v2 removes the result-cache key dependency; existing deployed v1 configuration is historical. The production `snapshot-url` deployment remains separate.

See [hosted AI contract](../docs/features/hosted-ai.md) and [manual tooling](../scripts/hosted-ai/README.md). The shared budget is not a second allocation for the later paid milestone. No cron or admin UI is added.

Historical v1 checkpoint on 2026-10-23: production applied `0010` through the guarded history runner; its 47 core/cost and 27 security assertions passed before and after deployment. The separate `scripts/hosted-ai/production.mjs` deployed the bundled hosted handler, verified the downloaded original source hash and JWT checks, and observed unauthenticated HTTP 401. Existing Auth/Storage counts were preserved. The owner subsequently confirmed separate production Secrets. Shared-budget activation froze development admissions with USD 0.000375 preserved and enabled only USD 9.999625 in production. No inference was performed during activation. Subsequent real production acceptance validated Auth/runtime configuration, three capabilities, deduplication and account isolation. Two rewrites failed response validation, so capability acceptance was incomplete at that checkpoint. All five calls are confirmed at USD 0.000180; the synthetic account/session were cleaned up with fees retained. Evidence: `output/tests/hosted-ai/production-final-audit.json`. Evidence: `output/tests/hosted-ai/production-activation.json`. Evidence: ignored `output/tests/hosted-ai/production-deployment.json` and `apps/desktop/output/tests/production-environment/2026-10-23T00-34-32-780Z/deployment.json`.

Privacy migration `0011_hosted_ai_content_minimization.sql` requires paused/drained admission, drops result ciphertext/expiry and the old settlement overload, preserves all costs and uses a field-whitelisted receipt function plus a five-minute UUIDv7 admission window. Both environments applied it plus forward receipt-ID correction `0012` and assistance revision `0013` on 2026-10-23, development first. Final source `e6985e1fdf2e7a3ab8f52214c4bff7dc30ba2ee92dc0c48733fb33cd84cccfa6` is matched in development v19 (paused) and production v7 (enabled). Four production capability, bodyless receipt, independent provider cost/token and exposed log/persistence checks passed. Both cache Secrets are retired and all historical fees/unknown holds retained within the original USD 10. Updated Tokens expose platform logs/backups/replicas/Secrets; their application boundaries are checked separately. Historical physical deletion remains unverified. See the hosted tooling pause/forward-repair runbook.

## Account billing (D0)

Migrations `0014_billing.sql` through `0017_billing_trial_conversion.sql` add private, RLS-protected billing state and service-role-only RPCs. They implement atomic account/environment trials, immutable provider ownership, individual paid-invoice facts, fenced operations/inbox retries, once-only refund/dispute renewal compensation and resumable grace closeout. They do not replace `sync_entitled`, change hosted AI policy or activate production billing. See [the billing contract](../docs/features/billing.md), [Edge boundary](functions/billing/README.md) and [manual tooling](../scripts/billing/README.md).

Development has no CLI migration-history baseline. `node scripts/billing/development-schema.mjs --apply` verifies the existing hosted schema, applies only ordered additive billing deltas, checks exact final RPC bodies and preserves AI budget/policy. Run current rollback SQL acceptance first. Production deployment and paid-service gates require their later milestone and owner launch decision. Never replay core migrations or drop billing/trial receipts to roll back.

[PROTOCOL]: Update this header when making changes, then check README.md.
