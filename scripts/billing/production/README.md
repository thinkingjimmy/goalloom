# Production billing configuration package

The historical offline package below remains a separate credential-free entry. The new [bounded installer](install/README.md) prepares exact production stages, private0033 worker observations, readbacks and a health CLI. It leaves readiness/source gates and jobs closed. Schema0018 stops existing1.9.10 sync, so parent review and a coordinated cloud cutover are required before schema apply. No production installation or launch is established by local tool acceptance.

INPUT: Current source, pinned local build dependencies, the saved production read-only observation and optional secret-free declared Live bindings.
OUTPUT: A deterministic versioned JSON package and a review checklist, or a finite refusal. No deployment, credential load, network call or provisioning.
POS: BILL-29 preparation only. This module does not replace accepted D0–D3 behavior or authorize launch.

[PROTOCOL]: Update this header when making changes, then check README.md.

Run from the repository root with Node 24 and the existing local Stripe 22.6.0 runtime at `/private/tmp/goalloom-billing-runtime`. No dependency download or installation fallback exists. `BILLING_RUNTIME` and deployment credentials from the environment are ignored.

```sh
node scripts/billing/production/cli.mjs --out output/tests/billing/desktop/bill29-config/package-v3
node scripts/billing/production/cli.mjs --verify output/tests/billing/desktop/bill29-config/package-v3
node scripts/billing/production/acceptance.mjs
```

Output is restricted to a new direct child of the ignored `bill29-config` directory. Existing output is never replaced. `--verify` rebuilds source/dependency fingerprints in memory and compares both files; a changed package, checklist or source fails. Partial directories are not accepted. There is no apply, remote inspection or provisioning mode. Existing development/Test-only `--apply` scripts must not receive Live credentials.

`cli.mjs` owns argument/file boundaries. `bindings.mjs` validates declared metadata. `inventory.mjs` fingerprints migrations 0014–0032, six actual Edge entries and their full esbuild input dependencies, and audits Stripe SDK calls/webhook event lists against current source. `policy.mjs` records commercial constants and operator steps. `package.mjs` composes the deterministic JSON/checklist. `acceptance.mjs` runs the real CLI in child processes with network, credential-file and non-build subprocess guards. [Failure cases](failure-cases.md) were recorded before these checks.

Optional `--bindings metadata.json` accepts only `version:1`, the exact production `environment/projectRef/account/rcProject`, and these metadata objects (null/missing means unbound):

- `monthly` / `annual`: `id`, `productId`, `livemode:true`, `active:true`, `currency:usd`, `unitAmount:899/7900`, `interval:month/year`, `intervalCount:1`, `taxBehavior:inclusive`, `usageType:licensed`, `billingScheme:per_unit`.
- `portal`: `id`, `livemode:true`, `active:true` and exact `features`: paymentMethodUpdate/invoiceHistory/subscriptionCancelAtPeriodEnd true; subscriptionUpdate/customerUpdate false.
- `revenueCat`: `appId`, `store:stripe`, `environment:production`, `entitlement:plus`, and matching `monthlyPriceId/annualPriceId`. Existing Stripe app IDs are not rejected by display name. Apple/Test Store apps and known Test Prices are refused; a cross-mode Product ID alone is not mode evidence.
- `ledger`: HTTPS `url`, `storeId`, `independent:true`. This declaration proves neither an existing service nor independent durability. Same-business-project Supabase endpoints and embedded credentials are refused.
- `tax`: explicit `automaticTax`, `taxRegistrationVerified`, `reviewReference`, `productTaxCode` and distinct ISO two-letter `permittedRegions`. Automatic Tax with unverified registration is refused. No sales region or registration is inferred from incorporation/EIN or the fixture metadata.

Bindings contain no keys, tokens or webhook secrets; unknown fields and sensitive strings fail without echoing values. Add the same `--bindings` argument when verifying a bound package. Even complete declarations leave productionVerified, deploymentReady, launchReady and bill29Complete false. The checked-in source does not contain real Live IDs or a fabricated deployed ledger endpoint.

The independent ledger HTTP port and restore-quarantine interface are implemented; their production services are not. Proposed hosting, cost references, authentication/gateway conflict, external isolation, actual provider backup-policy disclosure/restore safety, deferred tax facts, budget and launch authority remain explicit blockers in each package. A gateway alone cannot cover existing direct Supabase callers; the current lifecycle JWT/worker Bearer combination needs a separately reviewed deployment solution.

The final package/checklist and the local acceptance report are under [ignored evidence](../../../output/tests/billing/desktop/bill29-config/). CLI fixtures use synthetic metadata and a reserved example-domain ledger URL; they are not resources or tax recommendations. Actual restricted-key permissions, Live mapping/delivery, production installation, jobs/alerts and restore/backup guarantees require separate production-specific verification. BILL-29 remains unfinished.

Historical package-v1 CLI E2E passed 29 checks on 2026-10-25, including repeatable bytes, actual source hashes, no credential/network boundary crossing, strict inclusive prices, existing Stripe app/cross-mode Product ID declarations, a complete synthetic declaration that remains blocked, and JSON/checklist tamper detection. [Final review checklist](../../../output/tests/billing/desktop/bill29-config/package-v1/checklist.md), [versioned package](../../../output/tests/billing/desktop/bill29-config/package-v1/package.json) and [local acceptance result](../../../output/tests/billing/desktop/bill29-config/acceptance-result.json). Node 24.21.0/macOS arm64 only; Electron/SQLite were not used. This does not establish production verification.

Owner revision (2026-10-25): the current package removes the supplier-backup expiry ceiling. It preserves 720-hour retrieval, 168-hour online deletion, backup isolation/no user recovery and deletion replay before access reopens. Actual provider policies/configuration require disclosure; the initial approach retains Supabase Free and existing local backups, with no new self-hosted or paid backup service; Pro may be considered only after real paying users, without automatic purchase. Pro/new backups are not initial-launch prerequisites. Post-expiry retrieval remains pending discussion, with the current 720-hour rule unchanged. No daily SLA or paid backup service is approved. Tax/Managed Payments work is deferred; applicable-tax and sales/launch evidence remain required, with no tax configuration changes. Historical migrations and package-v1 are retained. Their legacy `backup_hours`/`backup_purge_by` metadata has no backup-erasure authority; review its naming/removal at the next lifecycle-schema change, without a new cleanup launch gate.

The current CLI acceptance writes `acceptance-result-v3.json`, preserving the original and v2 summaries and per-run reports. It adds assertions for the revised policy and deferred tax while using the existing guards; local CLI success does not establish production backup, tax or launch readiness.

Historical v2 revision verification: `node scripts/billing/production/acceptance.mjs` passed 30 checks, including the new backup/tax policy case. [Current report](../../../output/tests/billing/desktop/bill29-config/cli-a007857d-0cf7-4140-9618-bb6b189a1419/report.json), [summary](../../../output/tests/billing/desktop/bill29-config/acceptance-result-v2.json), [package-v2](../../../output/tests/billing/desktop/bill29-config/package-v2/package.json) and [checklist](../../../output/tests/billing/desktop/bill29-config/package-v2/checklist.md). Node24.21.0/Darwin25.4.0 arm64; Electron/SQLite were not used and physical/VM status was not independently verified. The initial revised assertion matched coincidental hash digits; its failed-run evidence is retained. The corrected assertion checks policy fields, not source hashes.


Initial approach follow-up (2026-10-25): Supabase Free and existing local backups are the decided initial approach. Do not build or buy an extra backup service. Consider Pro only after real paying users, without automatic purchase or a new initial-launch prerequisite. Post-expiry retrieval is separate and pending discussion; current retrieval remains 720 hours. Other readiness requirements remain.

The current [package-v3](../../../output/tests/billing/desktop/bill29-config/package-v3/package.json) and [checklist](../../../output/tests/billing/desktop/bill29-config/package-v3/checklist.md) preserve v1/v2. The CLI E2E passed 31 checks under the existing guards; [report](../../../output/tests/billing/desktop/bill29-config/cli-526a487e-f137-4af5-b4f6-94519637f779/report.json) and [summary](../../../output/tests/billing/desktop/bill29-config/acceptance-result-v3.json). This update changes descriptive metadata and local expectations only, with no runtime/database/website change or remote activity.
