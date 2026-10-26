# Content-minimization acceptance

INPUT: Fixed synthetic requests, exact action/invocation identities and explicit environment clients.
OUTPUT: Metadata-only evidence; content markers, full persistence/log payloads and provider keys stay out of reports.
POS: Shared acceptance boundaries for the manual [hosted AI tools](../README.md).

Members:

- `identity.mjs`: UUIDv7 action identities with a server-verifiable issue time.
- `fixtures.mjs`: Four finite public synthetic capability inputs; runtime markers remain in memory.
- `scan.mjs`: Complete persistence/RPC whitelist, bounded encoded-content checks and PostgreSQL/ISO timestamps.
- `platform-logs.mjs`: Complete exposed six-field log envelopes, strict network/lifecycle fields and exact synthetic invocation selection.
- `detector.mjs`: Deliberate plaintext, nested, encoded, compressed and ciphertext leak controls for both scanners.
- `features.mjs`: Serial affected-feature command selection, without full release/stress verification.
- `rewrite-check-runtime.ts`: Temporary one-owner/action diagnosis through the actual handler; only finite response-shape facts leave memory.
- `provider-receipt-runtime.ts`: Temporary service-authorized GET-only generation metadata check; no inference or key export.

Log field reference: [Supabase log constants](https://github.com/supabase/supabase/blob/master/packages/shared-data/log-constants.ts). Hidden platform trace stores, managed WAL/backup physical retention and historical physical erasure remain outside the public log API. Unknown fields fail closed; failure reports contain fixed categories only.

[PROTOCOL]: Update this header when making changes, then check README.md.

The controlled HTTP adapter covers `lifecycle_delivery_allowed` with exactly the development environment and a known fixture owner. Its metadata scanner permits `p_owner` only as a UUID; existing HTTP acceptance rejects private text, malformed owner values and unknown fields. This adapter does not change production lifecycle decisions.
