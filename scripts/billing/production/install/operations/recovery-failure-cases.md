# Recovery readiness and bounded source window failures

Recorded before implementation. The original installation, plans and receipts remain immutable.

| Failure | Required result |
| --- | --- |
| A source-only enable is proposed | Explain that billing_source requires BOTH source and billing policy. Do not claim worker200 with policy closed. |
| Billing policy/source are open but cloud is closed | Authenticated trial, Checkout, Portal and subscription actions are also available. State this exact exposure in the reviewed window; do not claim Checkout API closure from cloud/website flags. No new runtime gate is added for an acceptance window. |
| Original users/workspaces/devices exist | Preserve them. Empty billing work does not imply an empty owner workspace. |
| Old requests, AI unknown/running, leases, compensation or deletion work exist | Report exact aggregate states; refuse an empty-queue window. Never reset/delete work to satisfy preflight. |
| Old URLs/JWT/socket samples were not retained | Keep natural-expiry observation unverified. Use only actual current configuration, original retirement timestamps and clearly labelled elapsed bounds; do not invent a permanent sample gate. |
| New unknown-upload cleanup has no independent Storage bound | Keep transfer_drain_policy unverified. Never infer a physical absence or transfer lifetime from a timeout/elapsed wait. |
| Read-only Management role cannot read private metadata | Use existing operator with SQL BEGIN READ ONLY, no ACL change and no write retry. Save only finite metadata/digests. |
| Auth configuration is needed | Permit only GET /config/auth; retain only jwt_exp. Refuse config mutation before network and never save the full response. |
| Current source differs from historical installation freeze | Produce a new continuation manifest; never load/rewrite the original plan or replay installation. |
| A production window is not yet reviewed/dispatched | Inspection/preparation have no apply mode and no provider/model calls. Emit reviewable SQL and blockers only. |
| A scheduled bounded window loses its operator/cron pauses | Every resumed job checks the fixed database-clock deadline before dispatch, closes source/billing policy and restores/pauses its own command. A project/cron outage can delay the flag change; manual restore remains necessary. Do not claim a hard HTTP lease. No fourth job/controller/schema. |
| A valid event arrives during an empty probe | Refuse further dispatch; preserve accepted inbox/facts. Closing source may prevent delivery retries until the next reviewed window; never erase the event. |
| Arm/restore response is unknown | Check the original transaction and exact command hashes/request IDs. No second arm, no state-based assumption of rollback, no automatic write. |
| A protected field/job drifts | Transaction guards fail. Restore refuses foreign command/policy drift. Original cleanup cron stays unchanged. |
| Worker HTTP200 contains retry/pending or response is missing | Preserve actual request/outcome/counters. Queue insertion/elapsed time is not invocation success. |

[PROTOCOL]: Update this header when making changes, then check README.md.

## Focused real PostgreSQL window acceptance

Recorded before adding the PostgreSQL runner. Exact migrations are fixture setup only; do not rerun original installer31/rollback18 acceptance.

- Use only the existing dedicated bill29 Docker socket and prepared volume-free image. No pull, daemon/context change, network/ports/host mounts or existing-container mutation. Recheck the original recovery isolation guard before each SQL call and remove only the owned disposable container.
- Execute the generated arm/restore/finalize DO blocks in PostgreSQL with real pg_cron, pg_net and Vault. Refuse billing work and source drift before either flag changes. Ordinary cloud/lifecycle flags and original cleanup command must remain equal.
- Execute an exact stored command as its whole PostgreSQL query. Prove `current_query()` equality in that actual execution shape. A wrapper invoked as a substring of another query must refuse rather than silently bypass the exact-command check.
- Execute an expired exact stored wrapper and actual restore. Confirm billing/source closure and original inactive commands. Do not assume self-alter's cron run status: record actual scheduling if the prepared runtime supports it, otherwise report it unverified and do not infer canceled/success from DO execution.
- An ignored RevenueCat TEST row may remain and must not become actionable work. A pending real row must close the window before dispatch and must remain untouched.
- Tests must never dispatch pg_net HTTP. Use the observer for the open-path whole-query probe and roll back its metadata; use expired or work-stop paths for worker wrappers. Vault is installed as fixture structure but no synthetic credential or cryptographic key is needed for these window cases. SQL/DO acceptance does not establish actual hosted worker200 or provider delivery.
- The selected temporary window keeps both Stripe endpoints disabled throughout and sends only one existing RC Dashboard TEST. Their already approved activation waits for continuous receiver readiness; temporary toggling cannot manufacture delivery evidence. Preserve RC configuration.

## Production-role lock correction

Recorded before implementation after the original production arm HTTP400 was resolved as not committed. Do not alter production ACLs/schema or replay that arm.

- A fixture superuser does not represent the hosted postgres operator. Run only the new role/lock scenarios as a non-superuser owning application tables/jobs, with SELECT and no MAINTAIN/UPDATE/DELETE/TRUNCATE on separately owned cron.job. The old direct SHARE ROW EXCLUSIVE lock must fail under that role before any activation.
- Inspect the actual installed cron.alter_job definition/version and upstream implementation. Do not assume that all optional NULL parameters take a row lock or preserve values; prove exact metadata preservation and row-lock serialization in real PostgreSQL before adopting this path.
- If supported, use only existing cron.alter_job calls to lock all three original job IDs in stable order before evaluating exact job guards. A concurrent external edit must either complete before the lock and make the guard refuse, or wait and refuse its own stale update; never replace a foreign command silently.
- No-op API locking may invalidate cron cache or affect an active run. Capture actual scheduled expired-wrapper status and committed flags/commands under the restricted role; do not infer success from active=false alone.
- If the API cannot safely lock without changing values, stop at a concrete Root-reviewed single-operator boundary. Do not add a SECURITY DEFINER/RPC/controller, grant table privileges or impersonate an administrator in production.
- Reuse the prepared local image/VM for this focused role/lock acceptance only. Do not rerun the accepted13/22/9 suites or old installation acceptance. Remove the exact owned test container and return the VM to stopped after this task's scoped work.
