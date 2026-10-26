# Isolated local recovery

INPUT: A private plain-SQL production backup, the original lifecycle-key SHA-256 fingerprint and the current independent ledger.
OUTPUT: A resumable replay inside a tool-owned local network-none PostgreSQL container, with admission permanently closed.
POS: Owner-run recovery preparation. In-place production restore, hosted targets, export, reopen and cutover are unsupported.

[PROTOCOL]: Update this header when making changes, then check README.md.

`driver.mjs` accepts only `init`, `load`, `replay` and `status`. It creates its own container from an explicit local image digest. Every SQL call uses `docker exec` and the PostgreSQL Unix socket; it checks actual container identity, start time, network-none mode, no ports, no host/persistent mounts, unprivileged user, read-only root, dropped capabilities and resource bounds before and after dispatch. Only three ephemeral tmpfs paths are permitted. No existing container, remote Docker daemon or hosted database URL is accepted. Existing Supabase REST/Auth/Realtime/Storage/Edge credentials cannot reach this target. No Storage bytes are restored. The journal is private and never an admission attestation on its own.

`isolation.mjs` contains the actual inspect guard and command allowlist. `Dockerfile` copies an explicitly pinned official Supabase PostgreSQL17 image into a fresh image without its port/volume metadata; `postgres.sh` starts a Unix-socket-only server with extension preload workers disabled. The tested source image is `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`; generic PostgreSQL lacks the required Supabase extensions. Build explicitly; there is no automatic image pull, package purchase or hosted resource creation in the recovery driver.

Example operation (replace the image digest and private paths locally; do not paste secrets into chat):

```sh
docker build --build-arg POSTGRES_IMAGE=supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00 \
  -t goalloom-recovery-local scripts/lifecycle/recovery
docker image inspect goalloom-recovery-local --format '{{.Id}}'
node scripts/lifecycle/recovery/driver.mjs init --directory /private/tmp/goalloom-recovery-run --image sha256:<local-image-id>
node scripts/lifecycle/recovery/driver.mjs load --directory /private/tmp/goalloom-recovery-run --dump /private/path/production.sql
node scripts/lifecycle/recovery/driver.mjs replay --directory /private/tmp/goalloom-recovery-run \
  --credentials /private/path/ledger.env --key-digest <original-64-hex-fingerprint>
node scripts/lifecycle/recovery/driver.mjs status --directory /private/tmp/goalloom-recovery-run
```

The local Docker context must point to a Unix socket. For a dedicated test VM, pass a private `DOCKER_CONFIG` whose active context points to that socket; the driver then pins that local host for every command and strips inherited `DOCKER_HOST`/`DOCKER_CONTEXT`. Credentials and dump files require owner-only permissions. The credentials file contains only `DELETION_LEDGER_URL`, `DELETION_LEDGER_TOKEN`, `DELETION_LEDGER_STORE_ID`. No Supabase/provider credentials enter the container. Keep the original key and its fingerprint independently from a business backup. A mismatched key stops replay.

The supported input is an offline application logical dump: complete application/Auth/Storage schemas and data, necessary crypto extension declarations, and password-free required roles (excluding the already existing bootstrap `CREATE ROLE postgres`). Exclude operational cron jobs, network queues, Vault credential rows and pg_net/pg_cron installation. Under the required empty preload configuration those two extension installations fail; an arbitrary full Supabase/physical backup is unsupported. Preserve actual lifecycle function definitions and the original key; do not replace vendor schemas with stubs. The full synthetic acceptance uses official Auth v2.197.0 and Storage v1.81.0 SQL, pgcrypto/pgsodium/Vault,32 unchanged application migrations and0033 definitions with its sole pg_net installation declaration excluded. See its explicit transform and hashes in the schema-fixture result. No network dispatcher is accepted or enabled by this test.

The dump must contain the reviewed lifecycle schema and exact fixed production project binding. Old backups without those contracts fail closed; applying forward migrations to an isolated backup needs its own reviewed source set. Loading is single-dispatch. A partial/unknown load requires a fresh isolated container, never replaying a dump over partial state. A lost begin reply is resolved by the original store/prefix/key tuple. Capture/projection resumes the original run. At most25 replay steps occur per invocation; repeat `replay` when incomplete. A changed head is reported, and the next invocation captures the new complete prefix after the prior run finishes. No timeout is taken as proof of SQL failure.

Every result says `exposureAllowed:false`. Projection reconstructs deletion fences/receipts, not physical cleanup, Auth removal or provider settlement. It never clears `restore_blocked`, changes hosted readiness or creates an exposure-ready dump. Do not use a successful local result for hosted cutover. Any future cutover is a separate reviewed operation. Container restart changes its original start identity and loses tmpfs data; it cannot silently resume. After collecting metadata-only evidence, stop/remove only the exact tool-owned container. Never restore the independent ledger backwards.

`fixture-schema.mjs <source-journal> <report-directory>` prepares only a disposable isolated source using pinned official Auth/Storage migration archives already downloaded to `/private/tmp/goalloom-auth-source` and `/private/tmp/goalloom-storage-source`; it records every vendor/project input hash and offline exclusion. It follows the vendor namespace, transaction, generated-SQL and search-path rules. `acceptance.mjs <source-journal>` generates actual pg_dump bytes, imports them through the CLI in a second container, and uses only the separately hosted acceptance ledger. Its assertions cover original key mismatch, original receipt deadlines, restored-session invalidation, repeated original-run replay and actual network-boundary refusal. No unit or mock schema proves dump compatibility. Reports and synthetic private dump/credential files stay under ignored `output/tests/billing/desktop/bill29-execution/recovery/`; never commit them.
