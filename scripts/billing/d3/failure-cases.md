# D3 failure cases before implementation

[PROTOCOL]: Update this header when making changes, then check README.md.

## Fixture transport and attempt reporting

- A reset before response headers must retain a finite network cause and `fetch` phase, without an HTTP status or another dispatch.
- A truncated/reset response body must retain its received HTTP status, finite cause and `body` phase. A received status does not prove the complete response was read.
- The existing 20-second request deadline must remain unchanged. Its timeout must be distinct from a received HTTP error and must not cause an automatic retry.
- A deadline while reading a response body must retain the received status and the signal's finite timeout reason, even when the body reader throws AbortError.
- Successful JSON, empty acknowledgements, non-JSON Storage bytes and finite HTTP/PostgREST errors must keep the existing result semantics.
- Error names, codes and syscalls use explicit allowlists. Unknown values are classified without copying messages, stacks, URLs, headers, bodies or arbitrary strings. Nested causes and AggregateErrors must remain bounded, including cycles.
- A failed context open must write one immutable stage attempt before any fixture-dependent error handling. A failed context must not fabricate a journal, pilot or completion.
- Success and failure reports must attach only the context's cached whitelisted RC diagnostic. Reporting cannot trigger another provider read; a missing or failed getter must not replace the original stage result/error.
- Local acceptance must use actual loopback HTTP resets, truncated bodies and deadlines, plus the actual stage-report path. Controlled error objects may verify redaction only; they cannot establish the original remote failure cause.

## Worker HTTP boundary

- Missing or incorrect worker authentication must fail before scope inspection, RPC or provider access.
- Development worker requests with missing, malformed or overlong scope must fail before RPC or provider access.
- Expired, foreign-project or foreign-subject scope must fail at the authoritative SQL guard before claiming work or provider access.
- A missing `scoped: true` result must fail closed in development.
- Only canonical POST worker paths may accept a scope. Similar paths and other methods cannot reach unscoped worker dispatch.
- Overlapping requests with different scopes must retain their own RPC headers throughout each request.
- Production and ordinary user/webhook requests must use their existing composition, ignoring any caller-supplied worker scope.
- Scope expiry or target denial between the initial check and a later RPC must stop that RPC. SQL remains responsible for claim/write atomicity.
- Unexpected guard failures return a finite response without scope, credentials or raw provider payloads.
- The existing identity RPC accepts either Auth owner or internal subject. Worker composition must resolve read-only identity, guard its returned subject and reject creation/foreign resolution before reconciliation.
- Successful PostgREST void RPC replies can be HTTP204. Worker unlock and event completion must accept that acknowledgement without inventing a JSON body or turning committed completion into HTTP400.

## Development source deployment

- Planning must only bundle local source and must not load credentials.
- Apply without the exact D3 development window must fail before remote imports.
- An active old unscoped cron must stop source deployment; deployment must not change cron, secrets, readiness, budgets or production.
- Source readback or JWT metadata mismatch must leave the deployment report failed; an upload response alone is not verification.
- Private flag inspection must use the existing operator connection inside an explicit SQL READ ONLY transaction; the Management API's restricted read_only role cannot read those private tables. No ACL change or key reveal is permitted.
- A deployment transport failure must retain a finite phase/cause so a dispatched source write can be read back without redispatch.

## Journey orchestration

- A retained target must be listed in the new suite before Auth acquisition. Its workspace/generation and device public keys cannot change during preparation; an unlisted target must fail before remote calls.
- Normal `register_device` assigns its UUID. Persist that returned identity against the planned keys before creating the workspace and before immutable scope registration; never insert a synthetic device through SQL.
- A target creation requires a normal trusted trial grant with the original request ID and deadline. No paid/RC facts or global trial settings may be fabricated. A lost response reuses only that original claim.
- Reuse the existing fixture creation, exact initialization and Storage ports. The work scope must contain the actual original target and device before scoped worker/Storage work. Target preparation is a prerequisite, not D2 re-acceptance.
- A cancel must be a separate stage after refund and before expiry, preserving the paid window for its native checkpoint. Expiry cannot substitute for that observation.
- A expiry must read its original generation through authenticated lifecycle status after the final billing checkpoint. Wrong owner/target/environment, a missing generation, a non-retained state or a closed/absent authoritative retrieveUntil must fail rather than construct native retained metadata from planned dates.
- A replacement initial-switch branch must use a fresh identity/target and the existing accepted renewal pilot. It cannot enter renew, change branch after setup, reuse the retired A or bypass exact new-invoice recognition. Prior failures stay immutable.
- In that explicit branch, the first paid invoice is the prior invoice for transition and the old-period refund; it must not be labelled a newly passed renewal.
- No arguments and planning must not read credentials or call services. Unknown profiles, stages or journeys fail before loading remote adapters.
- Execution without the exact development window and lease must fail before credentials or network access.
- Auth UUID must never replace the resolved internal subject in subject-keyed SQL.
- A second fixture cannot start until the first fixture's complete cleanup is verified.
- Unknown provider mutation outcomes retain the original intent, idempotency key and object readback; they cannot cause a blind repeat.
- Test Clock advancement is asynchronous. Incomplete clocks and missing RC recognition stop with a finite pending observation.
- An automatic renewal requires a new `subscription_cycle` paid invoice. Manual finalization/payment cannot satisfy that observation.
- A ready clock can still leave a new invoice in draft. Permit one separately journaled additional one-hour advance, then read the same invoice. Advancing, missing invoice and draft states are Stripe-pending observations, never evidence of RC incompatibility. No further automatic advances or manual finalize/pay may satisfy the renewal.
- Future plan switches must keep the subscription and produce no immediate invoice or proration.
- A naturally billed phase change uses the observed `subscription_update` reason and must match its original schedule boundary/full configured amount. This cannot weaken the separate automatic-renewal `subscription_cycle` requirement or permit manual invoice finalization/payment.
- Grace payment must use the original failed invoice and original 72-hour deadline. The cutoff case makes one payment/closeout attempt and records actual ordering.
- Refunds and disputes must bind to their exact invoices/charges. Old refunds must not revoke a later paid window; dispute success must not resume renewal.
- Cleanup cannot discard unknown outcomes, unowned graph objects or unsettled financial work. Unsupported outcomes remain unverified.
- Cleanup's allowed product set must include complete real historical invoice-line prices from the same verified customer/subscription roots after a cycle switch. A current annual item cannot erase the owned monthly price. Foreign invoice ancestry and truncated line lists must still stop cleanup.
- The same verified invoice lines must preserve historical subscription-item IDs when Stripe replaces the item during a cycle change. RC's original si must match this real ancestry; arbitrary IDs and foreign subscription parents cannot be added.
- A real refund can omit livemode. Only that object type may inherit Test mode from its exact known Test charge/customer and matching known Test payment intent. Explicit live/null mode, foreign ancestry and missing mode on other object types still fail; never invent a livemode field on provider data.
- The explicit B initial-period branch uses its one planned annual identity and original paid invoice only. It cannot claim a successful renewal/cycle switch, change pilot recognition, enter renewal stages, create a seventh identity or shorten access after a partial refund.
- Invalid initial-period journey/stage combinations must fail before opening a context, loading a suite or creating Auth/provider objects, including calls that bypass CLI parsing.
- The initial-period branch cannot adopt a normal B journal or change branches between stages. Its partial refund must target the original USD79 annual invoice and preserve that invoice's exact service period and renewal choice.
- B initial-period setup must pause Backend session use until the native observer returns the same original session, using the existing native handoff. A pending native return cannot be bypassed by changing selectors.
- A native checkpoint must use the Desktop adapter's exact finite input contract. Backend session use stays paused until the latest returned original owner/session is saved to the same fixture journal, including on observer assertion failure. Foreign owner/session returns and public-permission files must be rejected locally before further requests.
