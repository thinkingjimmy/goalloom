# Hosted AI Edge function

INPUT: A session verified by the configured project's Auth API, finite shared input schemas and server-only secrets.
OUTPUT: Validated fixed-model results, receipt-only recovery and trusted usage settlement.
POS: Trusted HTTP/provider boundary. It never writes workspace data or creates trial/payment records.

- `index.ts`: Runtime composition. Environment comes from the known project URL or an explicit server override.
- `handler.ts`: Bounded HTTP parsing, finite capability validation, session checks, model calls, request-local result delivery and late provider-cost lookup.

Completed malformed JSON or writing-schema failures are definitive `malformed_response` failures, with actual fees or conservative reservations retained. They never appear as a pending transport outcome. Only interrupted or unavailable provider outcomes use bounded reconciliation.

[PROTOCOL]: Update this header when making changes, then check README.md.

Protocol v2 with migrations `0011`–`0013` passed development acceptance and is deployed to both environments. Development v19 is paused; production v7 is enabled. Both use source `e6985e1fdf2e7a3ab8f52214c4bff7dc30ba2ee92dc0c48733fb33cd84cccfa6`. Use `node scripts/hosted-ai/content-rollout.mjs --plan --environment development` and `node scripts/hosted-ai/deploy.mjs --plan` from the repository root. Deployment bundles the shared Zod schemas and pure desktop prompt builders with esbuild; do not deploy the unbundled directory through the generic CLI. Node buffer use is explicit in the handler; shared prompt byte limits use TextEncoder.

Secret: `HOSTED_AI_OPENROUTER_KEY`. No result encryption key is read or required. Retire the legacy cache Secret only after an authorized pause/drain, migration and historical-boundary review. Supabase provides its project URL and service-role key. No client key, tool, model or URL parameter is accepted. JWT verification remains enabled at the platform and Auth is checked again inside the handler.

Protocol-v2 POSTs require `consentScopeVersion: 3` in the strict shared action schema. Valid JWTs and UUIDv7 actions with missing/older consent scopes reject before admission, model metadata lookup or inference. Receipt-only GET does not grant new processing authority and keeps its accounting contract.

The prepared D1 handler and migration `0019` support `trial_or_paid` through the sole D0 service projection and version header. They check before provider metadata/inference and recheck after budget/account locks before reserving fees. Receipt retrieval and settlement stay independent. Existing `authenticated` policy behavior is preserved; unknown policies fail closed. Source preparation does not activate a policy or allocate a budget. Review [the feature contract](../../../docs/features/hosted-ai.md) before changing models, data scope, timing, rates or recovery.

Current D2 source retains explicit service header1 and the same fee/budget policy. Existing reservations/late receipts settle under the original detached subject after Auth deletion; the lifecycle delivery gate withholds results and receipt delivery for a closed account. No model retry, new live mapping or fee refund follows from account deletion. Deployment and hosted acceptance remain separately gated.

D1 development update: source `7c588577e852f7c5314ef6c011f5c93117169f23c8f998f4dc969d7589d58cd7` is deployed as v27 with `trial_or_paid`. The prior exhausted limit/spend, blocked flag, counters, fees and protections are preserved. Real status GETs and rollback-only atomic admission passed without a model request. Production was not accessed or changed; the earlier common-source deployment paragraph is historical for development.

Prepared source assistance uses owner-selected `deepseek/deepseek-v4.1-flash-1017`; draft/review keep the existing alias and Jev stays fixed. Draft/review use DeepInfra FP8 and explicit note rewriting uses the first-party DeepSeek endpoint; legacy guidance keeps DeepInfra, without fallback. Rewriting requires JSON output, the shared strict result schema and retains original completed checkbox lines and link targets before delivery. Forward migration `0013` enforces capability/model pairs without changing earlier receipts or costs.

Hosted rewrite prompts label completed lines and link targets already present in the same description as immutable quoted excerpts. They add no content source or consent category. Output validation remains authoritative and rejects altered anchors instead of repairing or storing the response.

Assistance explicitly requests supported reasoning effort `none`; public route checks require JSON output and effort support before reservation. Late receipt reconciliation prefers native token counts when exposed. Existing confirmed rows remain immutable. Scope-v3 desktop consent names the assistance operator and possible retention/training; earlier scopes cannot authorize real-user requests. Draft/review explicitly deny provider data collection; only explicit note rewriting allows the owner-approved official operator; legacy guidance continues to deny data collection.

Deployment boundary: development acceptance preceded production migration/deployment. Both legacy cache Secrets are retired, provider-secret digests and all fees are preserved, and four production capability/receipt/independent fee checks passed. The official operator may retain/train under the approved scope-v3 policy. Hidden infrastructure retention and historical physical erasure remain unverified; old restores must be re-cleaned before admission.
