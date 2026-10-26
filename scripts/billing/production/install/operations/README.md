# Private configuration and limited gateway checks

INPUT: Explicit private runtime handoffs, exact reviewed installation source and closed production metadata.
OUTPUT: Durable owner-only configuration or twelve bounded authentication/signature denials with protected-state readback.
POS: Two focused BILL-29 operator helpers. No deployment, key generation, valid business mutation, provider/model call or service activation.

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
