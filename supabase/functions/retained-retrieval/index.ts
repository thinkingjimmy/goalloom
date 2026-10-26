// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Supabase-injected URL and server credential; no extra provider secrets.
 * [OUTPUT]: Fixed-project retained-copy HTTP service, closed for unknown projects.
 * [POS]: Retrieval composition root, independent of ordinary sync and billing handlers.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createRetrievalHandler } from './handler.ts'
const url = Deno.env.get('SUPABASE_URL') ?? ''
const projectRef = url.match(/^https:\/\/([a-z]{20})\.supabase\.co$/)?.[1] ?? ''
Deno.serve(createRetrievalHandler({ url, projectRef, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  environment: projectRef === 'asqyvcnxdltzzfutbbqy' ? 'development' : 'production' }))
