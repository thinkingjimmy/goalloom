# Deletion status receipt

INPUT: The original protected 32-byte status secret, immutable request UUID and configured environment.
OUTPUT: Minimal fixed-expiry progress after Auth removal; no deletion, data enumeration or new authority.
POS: Separate no-Auth gateway. All lifecycle mutations still require verified live Auth/session.

[PROTOCOL]: Update this header when making changes, then check README.md.

`handler.ts` validates a 2 KiB body and sends only the secret digest to a service-only SQL lookup. `index.ts` supplies fixed server configuration. Never log the request or put its secret in a URL. Missing, invalid and expired receipts have the same unavailable response.
