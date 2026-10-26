# Live provider configuration failure cases

These cases were written before implementation. Acceptance uses the real CLI workflow and Stripe SDK against controlled loopback HTTP. It does not charge a customer or prove provider delivery.

| Case | Required result |
| --- | --- |
| Inspect or plan | GET only; no credential in output or evidence |
| Wrong account, Test object, Apple app or foreign RC project | Refuse before writes |
| Price has unspecified/exclusive tax, wrong amount/currency/interval, trial or tiered usage | Refuse adoption; never copy Test prices |
| Existing unmanaged object has a similar name | Leave it unchanged; only exact ownership metadata permits adoption |
| Duplicate managed identity or incomplete pagination | Refuse; do not guess |
| Plan tampered, old source, wrong review hash, missing write window or stale baseline | Refuse before mutation |
| Process crash, provider response loss or uncertain RC create | Persist dispatch before request; stop; never replay the same plan automatically |
| Apply twice | Refuse the consumed plan; a fresh inspect/plan becomes a verified no-op |
| Existing Test/Apple entitlement or offering mappings | Preserve all existing records; add only Live products and a separate non-current offering |
| Missing production SDK key or external Stripe app account proof | Refuse RC catalog binding |
| Webhook creation secret | Save only in an exclusive owner-only private file before reporting creation; missing secret is unresolved |
| Notifications before production receiver readiness without separate registration approval | Prepare exact requests only; do not create endpoints |
| Deferred tax, retry UI, runtime key or RC Live connection | Report unverified; do not infer launch readiness |
| Stripe requires at least two dormant cancellation reasons even with collection disabled | Send two valid options, keep enabled=false and verify disabled state by independent GET |
| CLI/API throws a secret-bearing error | Print only finite local error code; retain no raw provider error |

## Separately approved Stripe notification registration

These cases precede the registration implementation. Registration is separate from receiver activation and signed delivery acceptance.

| Case | Required result |
| --- | --- |
| Wrong proposal hash, missing registration window or unexpected CLI environment override | Refuse before credential access or provider requests |
| Existing CLI cannot read the exact Live account | Stop; do not log in, create an operator key or use the runtime key |
| Existing endpoint, incomplete list, or any Live subscription/invoice/schedule | Stop before creating either endpoint; review fresh state |
| Create response lost, process terminated or malformed response without an ID | Retain dispatch; never repeat creation automatically; reconcile the original outcome |
| Create returns an ID but secret persistence fails or response fields differ | Attempt immediate disable regardless; independently read the original ID; stop before the next create |
| Disable response is lost or fails | Independently GET the original ID; unresolved unless actual status is disabled; never silently activate |
| Existing private file is a symlink, has loose permissions, has conflicting values or cannot be synced | Refuse capture; never overwrite unrelated credentials; disable the new endpoint if one exists |
| Second execution or concurrent execution | Refuse the already consumed evidence directory; never recreate endpoints |
| Secret appears in child stdout/stderr | Keep it only in process memory and the atomic owner-only private file; no raw child output in evidence or errors |
| RC create response/HMAC defaults cannot be attested | Prepare the exact UI handoff only; no RC write executor or rotation of an existing integration |

## Temporary setup key and source-bound SDK attempt

These cases precede the SDK attempt implementation. The original CLI dispatch, definitive403 and independent empty-list evidence remain immutable.

| Case | Required result |
| --- | --- |
| Setup credential missing, wrong mode/owner/path, symlink, Test key or unexpected file fields | Refuse; never fall back to the CLI/runtime key or create a credential |
| New key is not independently account-readable or returns a different account | Refuse before endpoint creation; the old CLI key's account does not prove the new key's account |
| Source/SDK/proposal/prior-outcome evidence changes after prepare, or review hash/window is wrong | Refuse before credential use or network requests |
| Original attempt is not proved rejected, consumed attempt is replayed, or fresh endpoint/financial lists are nonempty/incomplete | Stop; preserve original journals; never recreate blindly |
| Existing RC HMAC value contains punctuation, quoting, spaces or escape characters | Preserve the original notification file byte-for-byte as a prefix and preserve its parsed RC value; append only new Stripe fields |
| Private capture, journal sync, field validation or disable response fails after a known new ID | Always attempt immediate disable; independently GET that same ID; stop unless custody and exact disabled readback succeed |
| SDK create response is lost | Record allowed status/code/request ID when available; stop without a second create or write retry |
| Provider error contains a secret or account data | Persist finite diagnostic fields and missing-permission tokens only; no raw message/body/headers |
| Successful registration is mistaken for delivery/launch readiness | Leave both endpoints disabled; report receiver/delivery and temporary-key revocation as pending |
| Setup-key revocation fails or its outcome is unknown | Root retains the exact private setup file until the original key's revocation is verified; no unrelated credential deletion |

## SDK connection recovery before creation

These cases precede the narrow recovery change. Reuse the same already created setup key; retain v2's source, plan and consumed journal.

| Case | Required result |
| --- | --- |
| Native SDK connection fails before or after dispatch | Keep only allowlisted DNS/TLS/socket error codes through the one-shot wrapper and SDK error; preserve zero write retries and secret redaction |
| v2 contains any create dispatch or recovery readback is not complete/empty for the expected account | Refuse the new attempt; do not interpret a connection error as proof that a write never happened |
| v2 has only started/unresolved and independent same-key account/list reads recover | Prepare a new source-bound v3 directory, preserving v2; root alone executes after fresh preflight |

[PROTOCOL]: Update this header when making changes, then check README.md.
