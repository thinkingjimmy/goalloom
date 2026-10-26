# Desktop billing

INPUT: Verified account-only Auth, environment configuration and explicit user billing actions.
OUTPUT: Trusted subscription state, recoverable requests and constrained browser continuation. No sync setup, task upload or AI consent.
POS: Main-process subscription boundary. Provider authorization stays in the billing backend.

- `journal.ts`: Atomic project/account-bound original request and continuation IDs. Unknown outcomes retain their original action and cycle across restarts.
- `service.ts`: Authenticated eligibility/catalogue projection, stable mutation requests, immutable cross-device aliases, matched complete/closed receipts and explicit receipt-only reconciliation, and finite Stripe URL opening, including the observed current Portal secret-query shape and legacy session-token path. The server clock and monotonic elapsed time bound cached access and callbacks.
- `return.ts`: Exact production-scheme callback parser and a development-only 127.0.0.1 listener. A callback queues reconciliation; it never grants service.

The renderer sends only finite actions through `shared/contracts/billing.ts`. A login, trial or purchase does not initialize sync or authorize AI data transfer. Still-valid eligibility survives background refresh. Renderer mutations include the initiating account guard. Only the original account/environment/intent can resolve a pending request; an unknown outcome stays in the private journal. Ordinary status refresh never consumes Checkout or Portal intent. Explicit Checkout checks carry the saved finite operation and cannot create a session or open a browser.

[PROTOCOL]: Update this header when making changes, then check README.md.
