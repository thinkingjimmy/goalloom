// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Supabase-injected project/service credentials, never request-selected configuration.
 * [OUTPUT]: The isolated no-Auth deletion-progress endpoint.
 * [POS]: Receipt composition root; no lifecycle mutation, model or provider integration.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createDeletionReceiptHandler } from './handler.ts'
const url = Deno.env.get('SUPABASE_URL') ?? ''
Deno.serve(createDeletionReceiptHandler({ url, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  environment: url === 'https://asqyvcnxdltzzfutbbqy.supabase.co' ? 'development' : 'production' }))
