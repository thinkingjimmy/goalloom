# Hosted Supabase (phase 0)

The desktop and mobile clients, and the shared packages under `packages/`, stay MIT ([`LICENSE`](../LICENSE)). Everything in this directory is GNU AGPL-3.0-only ([`LICENSE`](./LICENSE)): migrations, RPCs, Edge Functions, pgTAP, `reset.sql`, and `config.toml`. Client packages do not import this tree.

The sync service will be paid later through RevenueCat. This tree has no payment integration and no `public.entitlements` table. `public.sync_entitled(uuid)` in `supabase/migrations/0001_core.sql` is the only billing hook: `push_ops` and `pull_ops` call it with `auth.uid()`. While that table is absent the function returns true. After a webhook creates it, the function allows sync only when `entitlements.active` is true for that Supabase user id (`RevenueCat app_user_id`). Desktop and PC web billing comes first. Mobile apps use the same server entitlement. iOS external-purchase and multiplatform rules are unverified and have to be checked before launch.

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

`snapshot-url` calls `snapshot_access` with the caller's JWT, then asks Storage for a signed download URL (60s) or upload URL in the private `snapshots` bucket. Upload signatures are fixed at 2 hours and send `x-upsert: true`, so a retry can replace an object that is already there. A download of a published path with no object returns 404. A signing failure includes the Storage status and message. Redeploy this function after pulling it.

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

Current development targets `0001` through `0009_sync_security.sql` as one schema definition. There are no external users and no legacy-version rollout requirement. `0006` now contains the envelope correction; the final push definition lives in `0008`. Preserve and verify the developer's local backup before an explicit rebuild. The app does not deploy or reset the database.

`0008` adds the read-only `get_sync_status`, account usage/configuration, upload-only quota, registration protection, head-change-only notifications and bounded runtime cleanup. Accepted new bytes/ops are aggregated once per batch in the same transaction as operations and receipts. Fixed-order account bucket locks serialize devices; duplicate receipts do not update accepted usage. A quota exception rolls back the whole request and carries an upload retry timestamp. Download/status/receipts remain independently accessible.

The default limit version is 1, with enforcement **off**. Observe aggregate synthetic/developer usage first. Defaults: 6,000 ops/32 MiB per minute, 200,000 ops/512 MiB per UTC day, 64 registrations per UTC day. Hosted baseline/import/long-description/concurrency checks must pass before an operator enables enforcement. These limits do not assert compute capacity or justify purchasing a larger instance.

The core pgTAP transaction includes `tests/sync-cost-cases.sql` and rolls everything back. Run it only against an isolated development database initialized with the target definitions. It checks session/device/owner guards, no per-status counter writes, duplicate receipt accounting, upload blocking with read access, account separation, and bounded cleanup preserving durable data.

After verifying `pg_cron`, inspect existing jobs before installing `sync-cost-cron.sql`. It creates/updates one named job (`goalloom-sync-runtime-cleanup`) and sets a five-second caller statement limit. Inspect `cron.job` and `cron.job_run_details` for one active job and failures; do not create a GitHub schedule. Manual cleanup callers also set `statement_timeout='5s'`. Each call deletes at most 5,000 rows in each of five indexed categories. Existing disk allocation and the bill do not automatically decrease.

On 2026-10-16, release 1.9.3 deployed the exact `0008` definition to the hosted development project (PostgreSQL 17.11, Linux x86_64). All 47 existing core/cost pgTAP assertions passed in a rolled-back transaction after correcting the synthetic cleanup payload's JSONB type. The 159 operations and 159 receipts remained intact. `pg_cron` 1.6.4 has one active five-minute cleanup job; its first scheduled run succeeded with the five-second statement limit. `snapshot-url` was redeployed, downloaded and matched to the repository byte-for-byte; JWT verification remained enabled and the unauthorized smoke returned 401.

Evidence is under ignored `apps/desktop/output/tests/release-1.9.3/backend/`: `deployment.json`, `hosted-pgtap.json`, `cron-deployment.json`, `acceptance.json`, `edge-source-validation.json` and `edge-smoke.json`. Hosted quota concurrency, capacity, successful signed Storage round trips and live multi-client broadcasts were not rerun. Enforcement remains off. No paid resources changed. Synthetic client reports under `apps/desktop/output/tests/sync-cost/` do not prove hosted capacity or a bill reduction.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Non-destructive recovery

`0009_sync_security.sql` follows the applied `0008` schema. `create_new_workspace` verifies a real session-bound device, entitlement, canonical roster identity/hash and device/recovery checkpoint signatures. It creates another workspace without deleting existing data. An exact signed retry is idempotent. Recovery clients generate a fresh cloud generation to satisfy the account/generation uniqueness constraint.

`list_account(p_workspace uuid default null)` returns an explicitly pinned owned workspace or, for an unbound client, the newest owned workspace by creation time/ID. An unknown/foreign explicit ID returns null and never falls through to another space. Existing devices must supply their saved ID after recovery creates a new space. There is no automatic orphan cleanup or TTL.

`reset_sync(p_device, p_workspace)` is **DESTRUCTIVE** and deletes only the explicitly selected workspace; the account-wide one-argument function is removed. Use `create_new_workspace` for forgotten passwords. Other devices and data in preserved spaces remain available.

Run `node scripts/sync-security-hosted.mjs` from the root to validate the delta and real pgTAP in one rollback-only transaction through the scoped development SQL token in `.env.deploy.local`. `--apply` installs only the reviewed delta after a passing transaction. It does not fetch API keys, use live client sessions, change billing, reset the database or deploy a packaged app. Reports are written to `apps/desktop/output/tests/sync-security/hosted.json`. The test temporarily changes entitlement behavior inside its rollback transaction; no test identity or temporary function persists.

The 27 security checks cover creation/auth/entitlement/signatures, exact retries, preserved operations/rosters/envelopes, newest/pinned/foreign discovery, old-device reads and scoped cascade deletion. Desktop source and instrumented-package acceptance use synthetic HTTP/cipher/connectivity.

`pnpm test:sync-security:live` adds production service/SDK/SQLite acceptance through real hosted Auth, HTTP/RPC and private Realtime using explicitly authorized existing anon/service-role keys. Keys remain in memory; `--browser-keys` offers a one-use loopback password form if the scoped deployment token lacks `api_gateway_keys_read`. It never creates keys or changes project permissions. The runner creates two disposable `security-…@goalloom.test` users and removes only their rows and accounts in `finally`, then verifies they are absent. No global reset or snapshot cleanup is used. Reports and a redacted client log are under `apps/desktop/output/tests/sync-security/live/`. Google provider UI, production keychain, OS network transitions and signed installer acceptance remain separate from these password-auth client sessions.

[PROTOCOL]: Update this header when making changes, then check README.md.
