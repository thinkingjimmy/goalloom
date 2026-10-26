# Cloud privacy and retained copies

INPUT: Verified main-process Auth, explicit lifecycle/privacy intent and fixed project configuration.
OUTPUT: Trusted dates/notices, protected deletion progress and independent verified copy grants.
POS: Desktop coordinator above the shared cloud SDK and separate retrieval worker.

`service.ts` owns discovery, same-session preparation/confirmation, independent no-Auth receipt recovery and Q11 dismissal. The original status secret lives in purpose-protected `privacy-receipts.bin`, outside account vault teardown and workspace exports. Accepted/unknown confirmations retain their original identity. Privacy deletion never dispatches local clear or sync reset.

The sibling `sync/copies.ts` registry and `sync/retrieval-worker.ts` provide ready-only bounded inspection, baseline JSON/SQLite export and explicit TransferReview replacement. Only main resolves artifact IDs to files. An account-scoped Cancel action aborts only in-flight retrieval controllers and prevents ready publication; it preserves current work and allows an explicit retry. Explicit local clear drains retrieval work and removes managed copies while retaining status evidence.

[PROTOCOL]: Update this header when making changes, then check README.md.
