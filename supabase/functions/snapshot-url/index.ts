// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Supabase service credential, verified deployed producer digest and authenticated snapshot requests.
 * [OUTPUT]: Bounded D2 ciphertext proxy with durable correlated transfer tickets.
 * [POS]: Snapshot composition root. Runtime/Storage drain proof is configured separately per source digest.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createSnapshotHandler } from './handler.ts'
Deno.serve(createSnapshotHandler({url:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',producerSha256:Deno.env.get('SNAPSHOT_PRODUCER_SHA256')??''}))
