# Authenticated snapshot transport

INPUT: Project-verified Auth, service version 2, deployed producer digest, exact owner/device/workspace/generation/sequence/path and approved snapshot metadata.
OUTPUT: Bounded ciphertext GET/PUT with pre/post eligibility fences, immutable object hashing and no Storage credentials.
POS: D2 normal snapshot transport on the existing slug; retained retrieval has a separate proof path.

[PROTOCOL]: Update this header when making changes, then check README.md.

`index.ts` supplies runtime-only credentials and `SNAPSHOT_PRODUCER_SHA256`, the deployment-verified bundle digest. `handler.ts` proxies at most 2 MiB and checks `snapshot_transfer_access` before and after Storage. GET/PUT use the exact query fields `v`, `deviceId`, `workspaceId`, `generation`, `seq`, `path`; both require Auth/apikey and `x-goalloom-service-version: 2`. DTO/encrypted format remains 1. PUT uses application/octet-stream, create-only Storage and an immutable approved hash/size tuple. GET returns bytes plus `x-goalloom-content-sha256`; PUT returns version/method/hash/size. New upload paths include the generation. Existing approved legacy paths are read-only.

Every transfer first persists a prepared ticket with exact target, device/session and producer digest. Upload additionally passes the service-only `lifecycle_transfer_dispatch` account/generation/session/device fence before issuing Storage. Closure withdraws prepared upload permission, including a lost begin ACK; a resumed producer cannot dispatch it. Read-only downloads never block content deletion and still need final access before byte delivery. Dispatched/unknown uploads require independently proved producer and Storage bounds for that exact digest. The worker records `drained`, never inferred failure/absence, then removes and verifies the object. Unproved limits remain pending and are a launch evidence gap.

Old POST signing requests return upgrade_required. Storage error bodies and reusable URLs never reach the client. Direct object grants remain controlled by private-bucket RLS. A mid-transfer generation/eligibility change withholds data/success; stale-generation uploads cannot overwrite a new-generation path.

Record the last possible old-source mint boundary, in-flight allowance and two-hour legacy upload-token drain. New proxy deployment does not revoke an already issued token. Normal service admission never substitutes for E2EE/device proof or the separate [retained-retrieval capability](../retained-retrieval/README.md).
