# Retained retrieval

> Parent: [Supabase](../../README.md)

INPUT: A live project-verified Auth session, service header `2`, explicit retained workspace/generation and the installed lifecycle boundary. All DTOs are version `1`.

OUTPUT: A verified frozen manifest and proof challenge, one-use authorization, then bounded complete-log ciphertext pages. No ordinary sync permission, password processing or Storage credential is issued. Typed SQL denials preserve committed due lifecycle changes. Deployment source readback and real Auth/SDK acceptance are recorded separately under ignored output evidence.

POS: Isolated D2 server boundary. Migration `0027_retained_retrieval.sql` depends on the installed `0025` lifecycle helpers; `0028` owns purge wiring and activation. Client crypto/pins and plaintext replay remain independent checks.

| File | Responsibility |
| --- | --- |
| `index.ts` | Fixed project composition and injected server credentials. |
| `handler.ts` | Exact deployment/loopback routes, verified Auth, bounded POST transport, finite errors and actual response byte checks. |
| `protocol.ts` | Shared `packages/contracts` DTO schemas/limits, private RPC failures and canonical proof digest. |
| `control.ts` | Incremental signed roster/checkpoint/envelope integrity and fixed-profile verification. |
| `manifest.ts` | Bounded page orchestration, streamed canonical head hash and final locked CAS. |

POST actions are `bootstrap`, `authorize` and `read`. Each action accepts exactly `/<action>`, `/retained-retrieval/<action>` or `/functions/v1/retained-retrieval/<action>`. The function-name prefix matches the Supabase Edge runtime contract; the other forms support direct loopback and full external URLs. Unknown prefixes/actions, trailing slashes and extra segments fail before Auth/RPC. Bootstrap accepts an initial exact target/proof or a challenge roster continuation. Complete UTF-8 JSON responses are at most 4,194,304 bytes. Requests are at most 2,048 bytes. Source traversal holds no database locks across network calls; a build has a bounded deadline and cannot finalize a partial manifest. The server verifies signed control integrity; client key possession and existing pins establish trust before signing.

Validation commands and evidence belong to `scripts/billing/d2-retrieval-*` and ignored `output/tests/billing/desktop/d2-retrieval/`. Local HTTP fixtures are distinct from real PostgreSQL/Auth acceptance. Remote schema changes/deployment require the D2 coordination window.

The local client interoperability command uses production `CloudRemote` and `retrieveRetained` against this handler over loopback HTTP, with controlled Auth/RPC and actual recovery/operation crypto. The existing `scripts/billing/d2-owned-retrieval.mjs` harness also runs fixed-project real Auth/RPC in an explicitly leased development fixture. Accepted deployed v3 source/JWT readback and the `4e142` production-SDK three-operation fixed-head retrieval are separate from local HTTP evidence. Later actual PostgreSQL race and cleanup checks have scoped acceptance. The single finalizer write/readback and current-only boundary observation are accepted separately in `d2-finalizer-current-boundary-acceptance.json`; historical preservation gaps and the original full observer failure remain unresolved. These retained historical failures no longer block owner-authorized development migrations or synthetic-fixture resets. They do not establish historical preservation or production readiness. The remaining eight races passed actual PostgreSQL lock and rejection checks on 2026-10-25; all scoped fixtures were removed and six development flags closed. See `remaining8-result.json` and `final-absence-result.json` under `output/tests/billing/desktop/d2-lifecycle/fresh-remaining8-five-resume-2026-10-25/`. See the ignored review records `d2-retained-routing-install-acceptance.json`, `d2-forward-routing-fixture-window-handoff.json`, `d2-19ff983-two-race-review.json` and `d2-prepared-context-actual-cleanup-acceptance.json` under `output/reviews/desktop-subscription-d1-d3-2026-10-23/`. These checks do not establish packaged-native, Windows or production acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
