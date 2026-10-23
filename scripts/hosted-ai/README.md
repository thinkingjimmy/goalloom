# Hosted AI tools

INPUT: Explicit environment-bound configuration, synthetic test contexts and server metadata.
OUTPUT: Repeatable acceptance evidence and read-only usage summaries; no task content or credentials in output.
POS: Manual integration tooling; deployment and live model calls are explicit modes.

[PROTOCOL]: Update this header when making changes, then check README.md.

Failure cases and fixed contracts: [hosted AI](../../docs/features/hosted-ai.md).

Production rollout must use only `.env.deploy.production.local` and the exact production project. It must reject missing/drifted SQL history, keep JWT verification, read back the bundled source, and prove an unauthenticated call is rejected. Deploying code must not create a second integration budget, copy development secrets or enable inference. Missing production configuration remains a separate activation gate. Development spend and reservations must be preserved before any explicit transfer of the remaining shared allocation.

Activation failure contract: reject missing owner confirmation of production Secrets, unexpected environments/policies, changed Edge source/JWT, unsettled development attempts, or an existing production allocation that differs from the settled remainder. Freeze development admission in a row-locked transaction before creating the production allocation. An interruption between projects leaves development frozen; reruns inspect absolute remote state and never add credit. Keep all cost receipts. No inference, Auth fixtures, Secret retrieval or client publishing occurs during activation.

Production acceptance failure contract: require explicit `--environment production`, production-only configuration/session files and production-prefixed evidence; reject project/account drift and insufficient remaining reservations. Interrupted sends recover the saved action by GET only. Never overwrite development evidence or use its provider key to inspect production fees. Missing independent provider credentials must be reported as unverified, not matched fees. Fixture cleanup must preserve charged receipts and invalidate only the marked synthetic account. Keep owner workspace/Auth accounts unchanged.

## Commands

Run from the repository root:

```sh
node scripts/hosted-ai/deploy.mjs --plan
node scripts/hosted-ai/deploy.mjs --apply
node scripts/hosted-ai/deploy.mjs --secrets
node scripts/hosted-ai/budget-transfer.mjs --plan development
node scripts/hosted-ai/budget-transfer.mjs --apply development
node scripts/hosted-ai/budget-transfer.mjs --apply return
node scripts/hosted-ai/retire-cache-secret.mjs --apply --environment development
node scripts/hosted-ai/platform-inspection.mjs --environment development
node scripts/hosted-ai/platform-probe.mjs --environment development
node scripts/hosted-ai/http-acceptance.mjs
node scripts/hosted-ai/sql-acceptance.mjs
node scripts/hosted-ai/concurrency-acceptance.mjs
node scripts/hosted-ai/auth-acceptance.mjs
node scripts/hosted-ai/live-session.mjs --create
node scripts/hosted-ai/live-acceptance.mjs --plan
node scripts/hosted-ai/live-acceptance.mjs --apply initial
node scripts/hosted-ai/receipt-acceptance.mjs initial initial
node scripts/hosted-ai/live-session.mjs --cleanup
node scripts/hosted-ai/usage-acceptance.mjs
pnpm build
node scripts/hosted-ai/feature-acceptance.mjs
node scripts/hosted-ai/usage.mjs --environment development --json output/tests/hosted-ai/usage.json
node scripts/hosted-ai/usage.mjs --from 2026-10-22 --to 2026-10-23 --environment production --config .env.hosted-ai-readonly.production.local
```

`--apply` uses the owner-only `.env.deploy.local`, checks the fixed development project and preserves the existing USD 10 bucket. It does not configure or call a model. `--secrets` is a separate explicit step: it reads `HOSTED_AI_OPENROUTER_KEY` from the owner-only ignored `.env.hosted-ai.local`, preserves an existing cache key, and requires the token's Secrets write permission. Use a dedicated server key; the script never reads the existing BYOK `.env.local`. Never print or pass the key through chat. Neither mode deploys production, changes resources, resets costs or publishes installers.

`http-acceptance.mjs` runs the actual HTTP handler with controlled Auth/ledger/provider dependencies. `sql-acceptance.mjs` runs real development PostgreSQL checks in one rolled-back transaction. Their reports state their different limits. The feature runner accepts individual names such as `hosted`, `composer` or `credentials`; it stops after a failure for inspection. Existing owning suites keep their normal artifact paths.

`usage.mjs` defaults to the last 24 hours and UTC boundaries. It accepts `--from`, `--to`, `--environment`, `--config` and `--json`. Its default private configuration is `.env.hosted-ai-readonly.local`: set `SUPABASE_PROJECT_REF` and a project-scoped `SUPABASE_ACCESS_TOKEN` with **Database read only** permission. It uses the Management API's read-only transaction flag and SELECT-only SQL. Production requires an explicit production configuration. For a development diagnostic, `--config .env.deploy.local` can use the existing credential; it retains its broader deployment privileges, so use a separate read-only token for normal reports.

Reports omit emails, raw user IDs, task text and credentials. Account labels hash only account UUIDs, never content. Missing records and unconfirmed costs remain explicit. Usage reporting cannot change eligibility, protections, business data or the shared budget, and realtime admission does not depend on running it.

Tooling retries a failed metadata GET or explicitly read-only SQL transport once. HTTP permission/service errors remain explicit. Auth mutations, deployment, SQL writes and inference POSTs are never automatically retried.

## Artifacts and limits

Budget transfer failure cases: stop if either environment admits writes, has running/reconcilable unknown attempts, has changed fees, or has an unexpected allocation. A development return may preserve a closed, unconfirmed action only when its original full reservation remains charged and the source retains that amount in its frozen limit; it never releases unknown fees. Debit the source before crediting the destination. Persist exact before/after metadata before either write. An interrupted/unknown write must be resolved by exact readback, never by adding the amount again. A resumed operation must recognize its completed state. Both limits must never exceed the original combined USD 10. Returning development credit must preserve all fees, conservative reservations and receipts. No transfer enables admission.

Platform inspection failure cases: permission errors, missing full log payloads, an unrecognized log field, non-metadata attachment, configured export/trace sink, incomplete backup inventory or source drift must leave the review incomplete. Never query by task text or export log bodies. Only marked synthetic users/actions and the deployed function identity may select records. Inspect complete selected payloads in memory; persist fixed checks/counts only. Logical column removal does not prove physical erasure of PostgreSQL pages, replicas or backups. Secret retirement requires paused/drained admission, exact privacy RPC/source readback and unchanged provider-secret digest; delete only the obsolete cache-secret name.

Provider receipt worker failure cases: require the exact synthetic Auth owner/project, compiled action allowlist and service-role-only RPC authority. Reject existing unrelated functions, arbitrary queries and unknown provider identities. The temporary worker accepts GET only, bounds provider metadata parsing, returns cost/token/route fields only, never exposes its key and has no inference path. Remove only the source-matched temporary function on every exit. Inaccessible historical identities and closed unknown reservations remain explicit; never infer confirmed zero from missing records.

Live acceptance must fail before inference when its private session configuration, project identity, explicit execution mode or shared budget is invalid. Persist each action ID before sending; after an interrupted send, recover that same receipt instead of sending another POST. Missing usage remains reserved. A rerun must not delete receipts, reset costs, create another account or repeat a completed action. Reports must contain only request identities, validation outcomes and accounting metadata. Structural output checks are not human quality approval.

Synthetic live-session preparation must refuse to overwrite a private session, use confirmed administrative creation without sending email, and keep credentials owner-only. Cleanup must prove ownership of that exact fixture, soft-delete only its Auth account, invalidate access, and preserve every real cost receipt and the cumulative budget. Interrupted runs must keep the original session until receipt recovery is finished.

Session renewal must retain the same marked synthetic account and all saved action identities. Reject missing ownership/email markers and project drift. Use the private refresh token when present, otherwise an administrative generated link plus token verification without sending email; never reset a password or create another fixture to resume a paid run. Replace credentials atomically with mode 600 and verify the returned account before writing. Renewal does not authorize inference replay.

Live receipt acceptance must reject cross-account recovery, retain the same provider receipt and cost after a duplicate action, and block a protected fixture account before inference. It must compare independent provider generation metadata with ledger fees, preserve an unsuccessful original attempt, and validate synthetic result meaning without saving text. Protection changes may touch only the marked fixture account and must be removed in cleanup.

Reconciliation acceptance may close only the unsuccessful saved synthetic action after the database's ten-minute cutoff. It must prove account ownership, preserve its confirmed fee/request identity and leave the shared budget unchanged. It must stop if the cutoff has not passed; no new provider attempt is allowed.

New evidence lives in ignored root `output/tests/hosted-ai/`. Desktop reports record Electron, Node, SQLite and host scope. Controlled responses do not prove live model quality. The initial integration cap remains the same USD 10 shared with the future payment milestone, including conservative unknown reservations. Never replenish it automatically.

`concurrency-acceptance.mjs` creates one disposable development user for direct SQL admissions, verifies concurrent deduplication and the account concurrency limit, then settles only its known zero-cost synthetic reservations and removes them. It never calls a provider or changes the budget limit. `auth-acceptance.mjs` requires development API-key read permission, keeps returned keys in memory, and uses disposable synthetic Auth users for the real JWT/finite-input boundary; it invokes no model. A 403 is recorded as unavailable coverage. `usage-acceptance.mjs` executes the actual CLI in isolated subprocesses with controlled read-only metadata.

`live-acceptance.mjs --plan` validates all four synthetic capability inputs locally without network access. `--apply <run>` needs the owner-only ignored `.env.hosted-ai-session.local` with `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY` and a real user's `HOSTED_AI_SESSION_TOKEN`, plus the existing Management configuration for read-only accounting. It checks metadata-only eligibility and available reservations before inference. It persists action IDs before sending and uses GET only to recover previously sent actions on the same run. Reuse the same run name after interruption; a new name authorizes new charged attempts. It never deletes real cost receipts. A result can pass structural checks while fees remain unconfirmed; accounting then stays incomplete. Generated text is not saved, and human model-quality review remains a separate gate.

For a fresh synthetic session, use `live-session.mjs --create`; cleanup soft-deletes only its marked Auth fixture, checks that access is denied and removes its local session while retaining paid receipts. Choose a new run name when starting with a new account; old runs remain owned by their original account. An explicit capability selector, such as `live-acceptance.mjs --apply rewrite-fix assistance`, creates only that new attempt. `receipt-acceptance.mjs <primary-run> <rewrite-run>` uses the primary run's three other results and the selected rewrite run; pass the same name twice when the initial run passed all four. It checks semantic relevance, completed notes/links, actual duplicate recovery, cross-account denial, account protection and independent OpenRouter fee/native-token metadata. `reconciliation-acceptance.mjs <primary-run>` verifies natural closure of an unsuccessful original rewrite after its ten-minute cutoff; it never changes its confirmed fees.

On 2026-10-23 development Auth, four valid capability results, five physical attempt receipts, account isolation/protection and bounded reconciliation passed. The first rewrite was unusable; validation failures were incorrectly classified as pending and are now definitive failures. That original attempt remains charged. Provider fees total USD 0.000372551; per-attempt microdollar rounding conservatively records USD 0.000375 in the same USD 10 bucket, with no unresolved reservation. Evidence: root `output/tests/hosted-ai/acceptance-summary.json`. No generated task text or credentials are retained in these reports.

## Production code rollout

After explicit production authorization, use the existing guarded schema runner, then the separate hosted Edge entry:

```sh
node scripts/deploy/supabase.mjs --check
node scripts/deploy/supabase.mjs --apply
node scripts/hosted-ai/production.mjs --plan
node scripts/hosted-ai/production.mjs --apply
```

`production.mjs` reads only `.env.deploy.production.local` through the production client. It requires exact committed migration history through `0013`, bundles the same hosted handler, preserves JWT checks, verifies downloaded original source and checks unauthenticated HTTP 401. It never configures Secrets or creates a budget. The existing schema runner owns migration transactions/history and its 47 core/cost plus 27 security assertions. No desktop package is published by either command.

Historical v1 production Secrets belonged to `keqprrgvcefqdwnxaafv`: `HOSTED_AI_ENVIRONMENT=production`, `HOSTED_AI_OPENROUTER_KEY`, and a separate stable 32-byte Base64 `HOSTED_AI_CACHE_KEY`. Code deployment alone does not prove their presence or readiness. Production activation must first freeze development admission and verify no running/unsettled attempt, then allocate at most the original USD 10 less preserved development spend. The owner confirmed production Secrets on 2026-10-23. Activation froze development admissions and preserved USD 0.000375, then enabled production with USD 9.999625. After the production Token update, real Auth, eligibility and three model capabilities passed; runtime provider/cache configuration works. Two rewrites failed response validation, so full production capability acceptance remains incomplete. Existing production token permissions suffice for deployment; API Keys/API Key Secrets Read is additionally needed only for automated Auth fixture acceptance.


Historical v1 activation evidence remains in `production-activation*.json`. The `activate-production.mjs --apply` command is retired. For protocol v2, use the guarded `budget-transfer.mjs` workflow below; never recreate the original budget or configure a result-cache key.


## Production acceptance (historical v1 examples; current v2 workflow below)

The existing Auth, fixture, live and receipt runners accept `--environment production`. `acceptance-target.mjs` selects the exact project, `.env.deploy.production.local`, owner-only `.env.hosted-ai-session.production.local`, and `production-` evidence prefix together. Omitting the selector retains development defaults. Never reuse a development private session or credential fallback.

```sh
node scripts/hosted-ai/auth-acceptance.mjs --environment production
node scripts/hosted-ai/live-acceptance.mjs --plan production-initial --environment production
node scripts/hosted-ai/live-session.mjs --create --environment production
node scripts/hosted-ai/live-acceptance.mjs --apply production-initial --environment production
node scripts/hosted-ai/receipt-acceptance.mjs production-initial production-initial --environment production
node scripts/hosted-ai/live-session.mjs --cleanup --environment production
node scripts/hosted-ai/usage.mjs --environment production --config .env.deploy.production.local --json output/tests/hosted-ai/production-usage.json
```

Production receipt acceptance uses confirmed ledger usage and native token metadata, result recovery, semantic smoke, duplicate actions, cross-account denial and account protection. It deliberately does not load the development/BYOK OpenRouter credential; independent provider generation-fee comparison remains unverified in production. Development's historical independent comparison is separate evidence. A successful production smoke does not replace owner desktop testing, external OAuth UI or packaged-client acceptance. Retain the private fixture after an interrupted call until original receipt recovery is complete; cleanup soft-deletes only that fixture and preserves paid receipts.

When a capability has a definitive failed result, `receipt-acceptance.mjs <primary-run> <rewrite-run> --available-only --environment production` can still verify the three successful capabilities and security/accounting boundaries without new inference. Its report lists `missingCapabilities` and `allCapabilitiesPassed=false`; a passing partial report never completes production capability acceptance. Preserve the original failed actions and do not loop charged attempts until one passes.


On 2026-10-23 production Auth, three successful capability results, recovery/deduplication, cross-account isolation and account protection passed. Both rewrite attempts failed `malformed_response`; no validation was relaxed and no further inference loop was run. Five confirmed attempts cost USD 0.000180 in the production ledger; with USD 0.000375 preserved development spend, the shared remaining allocation is USD 9.999445. Production independent generation-fee comparison was not performed. Cleanup invalidated the synthetic session, removed the local production session file and retained all five cost receipts. Evidence: `production-final-audit.json` plus the production-prefixed runner reports. Owner desktop use and rewrite acceptance remain pending.

## Protocol v2 content minimization (development deployed; production gated)

Rollout update (2026-10-23): the owner authorized development-first migration/deployment, cache cleanup and bounded real-model verification within the original combined USD 10. Development has `0011`–`0013` and source-matched protocol v2 with assistance revision 1017; installed SQL and Auth checks passed. That original rollout completed with development v18 paused and production v6 enabled on the same source; see the canonical feature status. Both updated Tokens passed log, drain, backup and Secret access. Public backup metadata has no listed restore points or verified physical retention window. No physical-erasure claim is implied. Budget transfers use debit-first exact-state journals and preserve all fees, including a closed full-reservation unknown hold. Return unused development allocation after acceptance.

The current source returns results only on the original settled POST. GET and duplicate POST return receipts only. The older encrypted-recovery acceptance above is historical and does not prove this change is live. No cache Secret is configured or read by current source tools. The original SQL migration is unchanged; `0011` is a forward-only privacy migration.

Repeatable local/controlled commands:

```sh
node scripts/hosted-ai/content-minimization/detector.mjs
node scripts/hosted-ai/http-acceptance.mjs
node scripts/hosted-ai/sql-acceptance.mjs
pnpm build
node scripts/hosted-ai/content-minimization/features.mjs
```

The SQL command checks installed `0011`–`0013` RPCs, or stages the missing forward migrations inside a rollback-only development transaction with synthetic users. It never enables development, preserves the actual environment on completion and calls no provider. Controlled HTTP drops the original response after settlement and checks complete fixture-owned RPC/write records in memory. Deliberate input/output/log/encoded/compressed/ciphertext detector controls never reach real storage. Reports contain fixed checks and metadata; failures omit exception payloads and matched fragments. Default owning-feature commands exclude release/performance/stress and unchanged account/onboarding flows. Backend concurrency, deployed Auth, live models and platform logging remain separate evidence.

Every rollout operation requires `--environment development` or `--environment production`. Begin with local `--plan` and read-only `--audit`. `--pause` preserves the budget and disables admission under its row lock. Wait for `running=0` (original 90-second lease); retain all unknown reserves. `--migrate` applies only the reviewed forward `0011`–`0013` prefix while paused. Production uses exact full migration-history checksums; the development project has standalone hosted SQL, so its RPC bodies must match the exact legacy, initial privacy or corrected privacy version before migration. Audit records this difference. It never fabricates core migration history.

```sh
node scripts/hosted-ai/content-rollout.mjs --plan --environment production
node scripts/hosted-ai/content-rollout.mjs --audit --environment production
# Only after separate rollout authorization:
node scripts/hosted-ai/content-rollout.mjs --pause --environment production
node scripts/hosted-ai/content-rollout.mjs --migrate --environment production
node scripts/hosted-ai/production.mjs --apply
```

Development Edge uses `deploy.mjs --apply` after the matching paused SQL migration; it no longer initializes a USD 10 budget. The old production-allocation activation command must not be used for privacy rollout. Never restore old Edge code, result columns, body writes or cached-body recovery to regain availability. Leave the environment paused and repair forward.

Before `--enable`, place an owner-reviewed metadata-only `<prefix>platform-review.json` under `output/tests/hosted-ai/content-minimization/`. It must bind `environment`, `project`, `sourceSha256` and affirmative `bodyLoggingDisabled`, `tracePayloadsDisabled`, `gatewayCacheDisabled`, `historyLogicallyCleared`, `backupRetentionReviewed`, `restoreRequiresReclean` and `controlledAcceptancePassed`. These are evidence requirements, not an automatic verification of the hosting platform. Enable verifies deployed original source and preserves the existing allocation. Record the real platform logging fields/switches, actual backup/replica retention and physical-deletion limits externally without exporting bodies. A restored old backup must stay paused until re-cleaned. Retire `HOSTED_AI_CACHE_KEY` through the target project's Secret management only after drain/history checks; never read or change the model key during retirement. Do not mark physical erasure verified without evidence.

Live runners persist actions before POST, use timestamped UUIDv7 and never repeat an unknown inference. Resume queries accounting only; a delivered result cannot be recovered or quality-reviewed later. New charged attempts need an explicit new run/action. Independent provider fees use the selected environment’s runtime Secret through a source-verified temporary GET-only worker; never load `.env.local` BYOK or export the hosted key. Environment switching cannot borrow another project's session or credential.

## Revision 1017 acceptance contract

The owner selected `deepseek/deepseek-v4.1-flash-1017` for assistance only on 2026-10-23. Jev, draft and review retain their existing models; DeepInfra FP8, no fallback, price ceilings, the USD 0.50 reservation and original combined USD 10 cap remain fixed.

Before implementation, the failure cases are: an unavailable/expensive route or missing structured output support must reject before reservation; an incorrect capability/model pair must fail SQL admission; existing action identities must remain receipt-only across the model change; missing completed notes or links must retain the fee and reject the result; an interrupted transfer must never add duplicate credit; a closed unknown reservation must remain charged through each transfer; development failure must leave production paused and undeployed.

A new allocation round uses `budget-transfer.mjs --plan|--apply development|return --round revision-1017`. Each direction has a separate durable journal; completed earlier journals are preserved. Run `provider-receipts.mjs <saved-runs...>|--fixture --environment development|production` to compare existing receipts without inference or exporting the provider key.

Rewrite diagnostics are bounded to one pre-journaled synthetic action through the actual hosted handler. Before implementation, the failure cases are: reject a different owner/action/capability; use the real admission/settlement and fixed model route; never export content or the provider key; summarize upstream JSON/schema/anchor failures with finite booleans/enums only; never replay a sent POST; preserve confirmed/unknown fees; remove only the source-matched temporary worker even after failure. A diagnostic result is not capability acceptance.

The 1017 diagnostic returned valid JSON and the exact rewrite schema, but failed literal note-anchor retention. The corrective request separates immutable completed checkbox lines and link targets as quoted data and explicitly forbids translating those excerpts. Each excerpt is derived exclusively from description already present in the same provider request; no new source, entity, content category or provider is added. Unknown output fields, new completed claims and missing anchors still fail; no server repair or relaxed validation is permitted.

`--fixture` verifies the marked synthetic Auth owner first, then checks at most 32 of that owner's action identities, including diagnostic attempts. It reads no unrelated content and makes generation-metadata GET requests only. Missing provider identities stay unverified.

Before the reasoning/reconciliation correction: rewrite requests must explicitly send the model-supported `reasoning.effort=none`; missing endpoint effort support fails before admission. Late generation receipts prefer native tokens when available. Earlier confirmed normalized token counts remain immutable and are compared to the provider's normalized fields, with the basis explicit; provider identity, route and exact rounded cost must still match. A mismatch never releases a reservation or becomes a zero fee.

## Official-route development evaluation

Routing is an implementation choice under the existing model-validation authorization, not a permanent product constraint. Evaluate the selected assistance model on its first-party DeepSeek route with synthetic data first; production still waits for development acceptance. Draft/review keep DeepInfra and Jev keeps TypeSafe. No fallback or automatic retry is added.

Before implementation: the official route's missing JSON-schema grammar support must use JSON-object transport plus the unchanged authoritative result schema/anchor checks; missing JSON/effort support or higher prices rejects before admission. Five-language scope-v2 consent must name both actual writing operators. A scope-v1 device file or action must not authorize the new scope, and a new account inherits no consent. Reconsent/feature enabling makes no model test. Historical DeepInfra and new DeepSeek fees must retain their actual operator and token basis in independent metadata evidence.

Receipt-only tooling recovery must preserve the original POST HTTP/cache/invocation facts; each subsequent GET has separate metadata. A confirmed fee remains a financial fact even when a log scan fails. Recovery never changes quality failure into acceptance or sends the old inference again.

The earlier operator-change deployment was rejected before explicit owner approval. That approval has now been received, and official source `eb24fa86f8cc124a695f8246bcd97e3b1aecf711f947593f1126c17346c5f67c` is deployed as development v16. Never use temporary inference workers or another deployment entry to bypass an approval decision. Read-only accounting workers have no inference path.

The owner explicitly approved the first-party DeepSeek route on 2026-10-23. The previous receiving-operator deployment rejection is resolved for this prepared change; original budget and development-first gates remain mandatory.

Upstream-error diagnosis extends the one-action temporary worker with HTTP status and finite keyword-category booleans only. Raw upstream messages/metadata, task text and keys remain in request memory. An unavailable generation receipt preserves the reservation; absence is never confirmed zero cost.

The rewrite diagnostic verifies its marked Auth owner through a safe GET before its one POST. A prior TLS reset with exact zero admitted rows is retained as a transport failure; any corrective diagnostic uses a new journal/action and never replays a sent identity.

Before the terminal-reservation transfer correction: a definitive failed action can retain an unconfirmed full reservation without changing its failure to `reconciliation_closed`. Allocation transfers must reject running/unknown actions, failed actions inside the ten-minute reconciliation window, missing/partial reservations, active admission and changed exact-state journals. After that window, a terminal failed action may preserve its positive full reservation while only unused allocation moves. Never rewrite its failure, confirmed flag, request identity, charge or cumulative spend. Apply the same predicate in inventory and the locked write guard; production remains fail-closed on every unconfirmed action.

Before the receipt-proof correction: every selected successful capability and every confirmed provider identity must match independent operator/token/cost evidence. An earlier unconfirmed failed request may have a provider identity whose metadata is unavailable; retain its full reservation and list it separately. Missing metadata must neither become confirmed zero nor prevent the report from checking other selected confirmed capabilities. Never claim every physical attempt matched when any identity or fee remains unknown.

The authorized official-route attempt and one admitted diagnostic returned upstream HTTP 404/data-policy rejection; neither produced usable content or independently confirmed cost metadata. Preserve both USD 0.50 reservations. OpenRouter lists the official operator as training/retaining prompts and omits the selected endpoint from its public ZDR list. At that checkpoint exact account/key restrictions were unverified and no privacy setting had changed. At that earlier checkpoint both environments were paused, unused development credit was returned, and production migration/deployment was gated. See the canonical [feature status](../../docs/features/hosted-ai.md).

The owner then accepted official DeepSeek retention/training and authorized the corresponding paid-training account setting. The setting was saved in the existing signed-in Personal account, while all ZDR and logging/discount controls kept their prior states. Scope-v3 rejects earlier consents and adds the condition in all five languages. Draft/review send explicit `data_collection: deny`; assistance sends `allow`. Development v17 original rewrite, independent native-token/cost proof and final four-capability receipt acceptance passed. Runtime records remain metadata-only; historical unknown reservations remain charged. Production still requires the same development-accepted source and forward migration.

Final route-scope correction keeps legacy guidance on DeepInfra with data collection denied. Only explicit note rewriting uses official DeepSeek and allows its approved retention/training policy. Controlled HTTP covers both branches; the previously accepted four provider payloads/results and exact fee proofs are unchanged, so the forward source rollout performs no additional paid inference.

Review follow-up acceptance covers actual input intent lifetime, memory-owned retry nonces during renderer quota failure and mandatory current consent in each protocol-v2 POST. Controlled HTTP rejects missing/old/null/malformed scopes before reservation or catalog/provider access. `platform-probe.mjs` also sends otherwise valid missing/scope-1/scope-2 requests under a marked real Auth session, proves zero admitted rows, scans all exposed invocation envelopes and verifies unchanged fees. It sends no valid inference request. Development source acceptance must pass before the same source reaches production; prior paid capability proof remains historical and is never relabeled or replayed.

Initial delivery before the review follow-ups: both environments have `0011`–`0013` and source `519982fd1b7a385cd9f2086a1379bc390942f2f425f8c6cb3df8a3d6991701b0`; development v18 is frozen and production v6 active. Paid original-result/receipt/independent fee acceptance used source `c759789624c8936c6821d7551982abb00b1ceafc377dae14897dc33db9300076`; the later route-scope correction preserves those four payloads and adds the legacy guidance boundary without new inference. Both cache Secrets and all temporary workers/sessions are absent. Final combined cap USD 10, confirmed ledger USD 0.003686, unknown holds USD 1.50, available USD 8.496314. See ignored `content-minimization/current-rollout.json`, `rewrite-route-scope.json` and `final-environment-audit.json` under root `output/tests/hosted-ai/`.

Before scoping the privacy rollout manifest: later uninstalled migrations must remain deferred and must never enter this command's SQL transaction. Keep exact checksums/history for `0001`–`0013`; reject missing privacy revision, changed applied SQL and any already-applied newer history. A concurrent unrelated billing migration must not force billing deployment to finish a privacy audit. Record deferred version numbers, keep source/JWT/platform gates and every original budget/fee guard, and never enable a newly changed RPC without review. Validate the real CLI plan, exact remote readback and guarded production enable without model calls.

Review follow-ups completed: source `e6985e1fdf2e7a3ab8f52214c4bff7dc30ba2ee92dc0c48733fb33cd84cccfa6` is matched in development v19 (frozen) and production v7 (enabled). All 19 affected desktop command groups and 23 controlled HTTP checks passed; real old-scope probes in both environments rejected before reservation with complete exposed-log checks. The separate uninstalled `0014` billing migration stays deferred; scoped history still rejects applied newer versions and checksum drift. No paid inference or fee/hold/allocation change occurred. Both probe fixtures/sessions are removed. Current proof: ignored `content-minimization/review-followups.json` and `review-final-environment-audit.json`; the latter is repeatable with its adjacent `review-final-audit.mjs` after fresh read-only rollout audits.
