# Hosted Supabase (phase 0)

Project ref `asqyvcnxdltzzfutbbqy`. Migrations and tests run against that hosted database. Nothing in this folder starts Docker, and no key belongs in git.

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

The migration enables `pgsodium` when it is not already installed. Hosted projects already have it. `_ed25519_verify` calls `pgsodium.crypto_sign_verify_detached` and raises `42501` if that function is missing. Revokes name Goalloom tables and functions only.

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

`supabase/tests/0001_core.test.sql` is the only file `supabase test db` picks up. It rolls back. Cases 1, 4, 16 and 17 use real `auth.users` / `auth.sessions` rows and `request.jwt.claims`. Case 16 signs the recovery message with `pgsodium.crypto_sign_detached`. A fixed noble Ed25519 vector is checked against the same verifier. There is no sha256 oracle.

`realtime_can_read` covers an authorized device, a foreign topic, a revoked device, and a deleted `auth.sessions` row. The `ws topic read` policy on `realtime.messages` is asserted when that table exists. An already-open Realtime socket is not something pgTAP can drop; the Node script covers resubscribe.

## Edge function

Deploy after the migration. The hosted runtime injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not put them in the function source.

```sh
supabase functions deploy snapshot-url --project-ref asqyvcnxdltzzfutbbqy
```

`snapshot-url` calls `snapshot_access` with the caller's JWT, then asks Storage for a signed download URL (60s) or upload URL (7200s, host-enforced) in the private `snapshots` bucket.

## Realtime, Storage and JWT

```sh
node scripts/supabase-remote.mjs
```

Requires `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The script creates a user `p0-<uuid>@goalloom.test` through the admin API, signs in with a password, registers two devices, and deletes that user in a `finally` block. Google and Apple OAuth are not used.

It checks:

- `register_device` reads `session_id` from the access token
- `push_ops` accepts an authorized device and rejects it after `revoke_device`
- a private Realtime channel `ws:<workspace>` subscribes, keeps one broadcast after revoke, and fails the next subscribe
- `snapshot_access` rejects a foreign path and accepts a published object
- `snapshot-url` returns a signed download URL and a signed upload URL, and returns 403 for a foreign path

The "existing connection still receives" check waits up to 8 seconds. Resubscribe must be rejected.

## Reset

Safe only on this dedicated test project. It deletes Goalloom public rows, snapshot objects under `workspaces/`, and auth users whose email ends in `@goalloom.test`. It does not drop the database or touch any other user.

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/reset.sql
```

Run it when a Node run was killed before its `finally`, or before a clean pgTAP pass on a database that already has leftover rows. pgTAP itself rolls back.
