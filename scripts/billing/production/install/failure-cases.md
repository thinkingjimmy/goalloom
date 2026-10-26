# Production installer failure cases

Frozen before implementation, 2026-10-25. These cases cover installation only. Accepted D0–D3 product journeys are reused.

| Failure | Required result |
| --- | --- |
| Wrong project, development credential, missing explicit mode or malformed plan | Refuse before credential read or network dispatch where possible; never infer a target from environment variables. |
| Source, SQL, JWT mode, plan or dependency changes after review | Refuse before any mutation. Bind exact executable bundles and generated SQL bytes. |
| Production has an unexpected migration prefix or edited historical SQL | Refuse installation; do not baseline, rewrite history or replay migrations. |
| A schema write loses its response | Persist intent before dispatch; inspect history and original transaction before further work. Never replay an uncertain write. |
| Concurrent installer or accepted cloud/AI write | Advisory lock plus table locks and active-work checks; bounded lock/statement timeouts; no force termination. |
| 0018 inserts its development policy on production | Rebind only the newly created, closed policy before 0025 backfills subjects; preserve original migration bytes in history. |
| Schema transaction fails midway | One transaction rolls back all pending migrations/history. No reverse/drop migration. |
| Edge deployment response is unknown or an existing Edge differs | Download and hash the original executable source; check status and JWT mode. Resume only through observed state. |
| Secret upload response is unknown, existing secret differs or file is unsafe | Owner-only explicit file; finite configuration validation; remote digest readback. Never expose values or silently replace existing secrets. |
| The Management API read-only role cannot decrypt Vault after the original write commits | Keep the same operator credential and enforce `BEGIN READ ONLY` in SQL for the digest-only Vault readback. Never change ACLs, return decrypted values or repeat the original write. |
| A Vault outcome check loses access, leaks credentials or attempts another mutation | Preserve the original intent and finite failure. The focused CLI E2E must distinguish the denied API read-only role from SQL-enforced operator reads, verify digest-only output and reject a second apply. |
| The Management API read-only role cannot execute the private health function | Use the same operator under SQL `BEGIN READ ONLY` for this one metadata function. Preserve existing alerts and thresholds; inactive jobs and closed Billing failures must remain non-green. Ordinary cron reads keep the API read-only role. |
| Worker credential/JWT composition is unresolved | No enabled schedule. Installer mode is source-bound and the reviewed lifecycle authentication composition must be checked separately. |
| pg_net returns a request ID but endpoint fails, times out, gives malformed JSON or never responds | Persist exact request ID and completion state; 200 plus validated finite counters establishes a completed invocation. Queue success alone is insufficient. |
| Billing worker retries or grace cutoff remains due after 72 hours | Expose retry and original overdue-grace counts/age; preserve the engine's original deadline. Never extend grace or report provider retry alignment from app cutoff. |
| Lifecycle cleanup stalls or seven-day deletion deadline is at risk | Expose queued work, deadline risk, leases and last successful invocation; keep independent deletion ledger/restore admission mandatory. |
| Whole project/cron stops | The read-only health CLI can be invoked externally to detect stale completion/failure. Database self-observation cannot detect its own outage. No paid monitor or new continuous heartbeat launch prerequisite is introduced. |
| Unknown response during job setup or pause | Exact job name/command/schedule/active state and Vault digest readback; no duplicate or automatic unpause. |
| Retention cleanup is accidentally run during preparation | Jobs are created inactive; retention housekeeping requires lifecycle readiness and no restore barrier. Preserve AI budget/protection, current financial holds and original data. |
| Partial installation or provider/ledger binding absent | Readiness and source flags remain false. Report installed stages separately; do not call BILL-29 complete. |

[PROTOCOL]: Update this header when making changes, then check README.md.
