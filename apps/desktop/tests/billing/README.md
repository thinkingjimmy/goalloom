# Billing acceptance composition

INPUT: Current desktop sources, isolated profiles and explicitly assigned development fixture sessions.
OUTPUT: Owning local boundary/sync evidence, legacy provider journeys and attach-only native checkpoint observations.
POS: Test-only billing adapters; production billing, Auth and provider facts remain authoritative.

[PROTOCOL]: Update this header when making changes, then check README.md.

- `boundary.ts`: Local HTTP/journal/continuation acceptance.
- `sync.ts`: Existing billing admission and exact sync-receipt integration.
- `provider-entry.ts`: Production desktop composition with controlled OS cipher and real Auth/billing; legacy password sign-in or original-session attachment.
- `observe.mjs`: D3 native observer and finite CLI; no provider provisioning or cleanup.

Before implementing attachment, prevent these failures: the observe branch reaches legacy credentials/provisioning; an input selects production or another Auth owner/session; a private session file has public permissions; the observer signs in again or loses a rotated original token; a cached DTO or local paid grant becomes evidence; a status check changes Backend's unresolved payment race; model/provider/sync writes occur; secrets enter reports; cleanup signs out the shared session or removes Backend evidence. Fail closed and preserve the original observed result.

The observer receives an owner-only input JSON containing journey/scenario IDs, the exact original session/journal path, owner UUID, actual development origin/anon key, expected public access/period fields and an output directory. `--reconcile` explicitly permits the existing UI refresh after Backend pauses mutations. Default status uses production GET. Root must assign the concrete Backend/native window before execution; `--validate` reads local input only and does not start an app or make a request.

```sh
pnpm --filter @goalloom/desktop exec -- node tests/billing-provider.mjs --observe --input /absolute/private/checkpoint.json --validate
pnpm --filter @goalloom/desktop exec -- node tests/billing-provider.mjs --observe --input /absolute/private/checkpoint.json
# Add --reconcile only for a Backend-paused stage that needs the normal UI refresh.
```

The input file must be mode0600 and contain:

```json
{
  "journeyId": "backend-journey-id",
  "scenarioId": "A-monthly-renewed",
  "sessionPath": "/absolute/private/original-journal-or-session.json",
  "ownerId": "<original Auth UUID>",
  "apiOrigin": "https://asqyvcnxdltzzfutbbqy.supabase.co",
  "anonKey": "<development public anon key>",
  "outputDirectory": "/absolute/ignored/new-checkpoint-directory",
  "expected": {
    "status": "active",
    "eligible": true,
    "grace": false,
    "effectiveEnd": "<exact authoritative ISO timestamp>"
  },
  "expectedPeriod": {
    "status": "active",
    "cycle": "monthly",
    "nextCycle": null,
    "endsAt": "<exact authoritative ISO timestamp>",
    "cancelAtPeriodEnd": false
  }
}
```

`sessionPath` must be mode0600 and hold Backend's original `fixtures[].ownerId/sessions[0]` journal, a fixture's `sessions[0]`, `{session: <Supabase session>}`, or that exact Supabase session with `access_token` and `refresh_token`. No token goes in the command or report. The actual session is verified through Auth before it becomes evidence. Backend pauses session use/refresh during the callback, then consumes returned `sessionPath` before its next operation. Native never edits the Backend journal. It keeps the same local profile per journey/owner/session, pauses native Auth auto-refresh before exporting the latest original session and exits normally without sign-out.

`expectedPeriod: null` asserts no current displayed subscription. Optional `retainedTarget` contains original `workspaceId`, `generation`, `retrieveUntil` and `retrievalWindowOpen` for A’s explicit retained-target assertions. Production’s automatic account-bound lifecycle discovery remains allowed at assigned checkpoints; initialization, upload and deletion remain denied. All expectations are assertions against actual DTO/UI. The cancellation-date row is asserted only when authoritative `effectiveEnd` exists. A revoked state without an end date still requires its actual revoked status label and the original `cancelAtPeriodEnd` DTO assertion. The observer writes `report.json`, an app-only screenshot and mode0600 `session-result.json`. CLI output is only `{ok, reportPath, sessionPath}`; CLI input failures use a finite error code. The exported callback is `observeNativeCheckpoint(input, { reconcile: false })` from `observe.mjs`. No additional callback service is introduced.
