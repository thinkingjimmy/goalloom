# deploy/

> Parent: [scripts](../README.md). Production backend deployment only; desktop packaging and development resets remain separate.

INPUT: Reviewed `supabase/migrations`, existing pgTAP fixtures, `snapshot-url` source and a production-scoped token in ignored `.env.deploy.production.local`.
OUTPUT: A guarded database deployment with migration history, private Realtime configuration, verified Edge source and redacted evidence under `apps/desktop/output/tests/production-environment/`.
POS: Operator-run Management API client. It never changes billing, retrieves API keys, resets data or publishes installers.

Failure cases fixed before implementation:

- A missing token, wrong project, unknown flag or overly permissive credential file must stop before any remote change.
- Existing application tables without migration history, changed applied SQL or a non-prefix history must stop rather than rebuild or overwrite.
- A concurrent deployment must not apply a migration twice; schema and its history commit together.
- SQL acceptance failures must roll back every fixture and temporary function change. Production Auth users and business records must remain unchanged.
- A timeout has an unknown outcome. Stop; inspect migration history, deployed function source or existing jobs before any rerun. Never automatically retry a write.
- Google settings and secrets must not appear in output or be overwritten by deployment.
- Realtime must reject public channels; Edge JWT verification must stay enabled. A downloaded source mismatch fails acceptance.
- Cleanup must have one named bounded job and must not remove durable workspace data. No reset or account-wide cleanup is permitted.
- A schema-only success must not be reported as Google OAuth, signed-installer or two-device acceptance.
- Edge archive inspection must reject truncation, unsupported checksums/versions, extra executable modules, missing original source maps and a mismatched entrypoint or original source. It must never execute downloaded code.

Members:

- `client.mjs`: fixed production identity, private environment loading and bounded/redacted Management API requests.
- `schema.mjs`: migration manifest, transaction guards and existing rollback-only SQL acceptance.
- `edge-source.mjs`: bounded, non-executing source-map inspection for the current Supabase ESZIP 2.3 response.
- `supabase.mjs`: operator entry, configuration/deployment sequence and evidence reports.

Commands from the repository root (Node.js 22.12+, system `curl`; `unzip` is needed only for ZIP-formatted downloads):

```sh
node scripts/deploy/supabase.mjs --plan
node scripts/deploy/supabase.mjs --check
node scripts/deploy/supabase.mjs --apply
```

`--plan` is local only. `--check` checks configuration and validates pending schema plus existing pgTAP in rolled-back transactions. `--apply` performs those checks before persisting migrations, private-only Realtime, the Edge Function and bounded cleanup. It records every completed stage so a partial run can be inspected and resumed explicitly.

Current Management API downloads use ESZIP 2.3. Source verification compares the single executable module's inline original TypeScript from its source map with the repository; generated JavaScript is not described as byte-identical TypeScript. Unsupported archive variants fail closed.

[PROTOCOL]: Update this header when making changes, then check README.md.
