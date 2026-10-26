# Private config and limited gateway failures

Recorded before implementation. These helpers do not deploy or enable service and do not create provider keys.

| Failure | Required result |
| --- | --- |
| Provider/ledger source is missing, symlinked, permissive or outside its explicit path | Refuse without outputting contents; no destination write. |
| Source contains operator credentials, duplicate conflicting runtime values, Test key, wrong project or incomplete fields | Copy only the finite runtime allowlist; refuse conflicts/invalid complete config before destination creation. Never persist operator keys. |
| Durable target is not the fixed repository path or not gitignored | Refuse. No configurable production output destination. |
| Durable file exists | Verify identical complete values and0600; do not overwrite or chmod a differing/unsafe file. |
| Process stops after new-file write | fsync before acknowledgement; independent private reread determines completion. Keep temporary input files; never auto-delete them. |
| Secrets need quoting or a malformed env would change a value | Round-trip the exact serialized env in memory before writing; refuse without printing the value. |
| Gateway run has no reviewed exact plan, source changed, wrong project, uninstalled Edges or open gates | Refuse before probes; local plan/default never read credentials or use network. |
| Manual-auth route rejects at the wrong layer or returns configuration failure | Require exact handler error for manual routes. Metadata alone does not prove actual auth. |
| Forged JWT, wrong worker Bearer, invalid HMAC or missing receipt | Deny with the finite expected status/code; no valid user, callback, worker, receipt or payment is created. |
| Response body/transport is malformed, oversized, slow or redirects | Finite failure, bounded shared deadline, no retry, no body/header/credential logging. |
| Protected state changes during negative probes | Report unverified preservation; never reset budgets/data or treat a timeout as a product diagnosis. |
| Root later opens source for normal worker200/signed callbacks | Reuse the existing coordinated acceptance window; these helpers add no extra framework or launch prerequisite. |

[PROTOCOL]: Update this header when making changes, then check README.md.
