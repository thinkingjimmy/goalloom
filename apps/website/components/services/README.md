# services/

> Parent: [Website](../../README.md)

- `billing-cycle.tsx`: Shared native radio group with localized monthly/yearly labels, keyboard navigation and no-JavaScript selection; a unique id isolates each group.
- `home-pricing.tsx`: Homepage left-column heading with shared PricingPlans cards on the right; omits the Free account/subscription note.
- `pricing-plans.tsx`: Shared Free/Plus cards, semantic heading levels, optional Free billing note and unique control ids; owns the in-card billing selector, calculated annual savings, platform downloads, BYOK provider-fee/AI-encryption disclosures and localized trial-FAQ link. No trial activation.
- `pricing-page.tsx`: Shared PricingPlans cards, the homepage common FAQ and a separate billing-only group for purchase, renewal, expiry, cycle changes, grace and channel management. Trial/refund answers are reused in the common group; legal links remain in the footer. Each group expands independently and preserves native policy anchors. Exports standalone support for billing pages. No checkout, account lookup or entitlement calculation.
- `billing-page.tsx`: Noindex/no-referrer static continuation composition, billing-only shared header/main/footer gutters, direct localized app instructions and download/private-support fallback.
- `billing-status.tsx`: Canonical-only finite continuation, scrubbed URL, session-scoped locale recovery, explicit fixed app/loopback navigation and manual/offline/invalid feedback. Never authenticates, fetches the backend, processes payments or infers payment status.

Prices, availability and translated facts come from `lib/services/`. The D1 BILL-12 handoff is non-authorizing; desktop/backend verify its owner, original operation and server expiry. Public purchase/trial entry remains closed.

[PROTOCOL]: Update this header when making changes, then check README.md.
