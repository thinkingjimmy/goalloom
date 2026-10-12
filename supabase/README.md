# Hosted Supabase (phase 0)

The desktop and mobile clients, and the shared packages under `packages/`, stay MIT ([`LICENSE`](../LICENSE)). Everything in this directory is GNU AGPL-3.0-only ([`LICENSE`](./LICENSE)): migrations, RPCs, Edge Functions, pgTAP, `reset.sql`, and `config.toml`. Client packages do not import this tree.

The sync service will be paid later through RevenueCat. This tree has no payment integration and no `public.entitlements` table. `public.sync_entitled(uuid)` in `supabase/migrations/0001_core.sql` is the only billing hook: `push_ops` and `pull_ops` call it with `auth.uid()`. While that table is absent the function returns true. After a webhook creates it, the function allows sync only when `entitlements.active` is true for that Supabase user id (`RevenueCat app_user_id`). Desktop and PC web billing comes first. Mobile apps use the same server entitlement. iOS external-purchase and multiplatform rules are unverified and have to be checked before launch.

Security of the hosted service is end-to-end encryption plus secrets kept in the environment. Hiding this source is not a control. Do not commit database URLs, anon keys, service-role keys, or access tokens. The project ref below names the dev project; it is not a credential.

Project ref `asqyvcnxdltzzfutbbqy`. Migrations and tests run against that hosted database. Nothing in this folder starts Docker.

The coordinator's machine exports:

```sh
export SUPABASE_DB_URL='postgresql://...'          # database password, direct or pooler session mode
export SUPABASE_URL='https://asqyvcnxdltzzfutbbqy.supabase.co'
export SUPABASE_ANON_KEY='...'
export SUPABASE_SERVICE_ROLE_KEY='...'
```

`SUPABASE_DB_URL` is the Postgres URI (Settings → Database). `supabase test db` and `psql` both use it. The Node script uses the three API variables and never reads the database password.

## Migrations

From the repository root, with the [Supabase CLI](https://supabase.com/docs/guides/cli) logged in (`supabase login`):

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
```

`0004_roster_signers.sql` depends on `_roster_message` from `0003`. `commit_roster` and `rotate_epoch` then accept only the calling device's authorized signing key. `complete_recovery` accepts only the current roster's `recoverySignPub`. A mismatch raises `roster_signature_rejected` (`42501`).

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
node scripts/pg-sync-test.mjs
```

`supabase/tests/0001_core.test.sql` is the only file `supabase test db` picks up. It rolls back. Cases 1, 4, 16 and 17 use real `auth.users` / `auth.sessions` rows and `request.jwt.claims`. Case 16 pins the recovery nonce and checks a noble signature from `scripts/gen-ed25519-fixtures.mjs`. There is no sha256 oracle and no pgsodium key generation.

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
