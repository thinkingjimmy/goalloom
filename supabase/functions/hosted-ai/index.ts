// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Supabase runtime secrets and the environment-bound hosted handler.
 * [OUTPUT]: Authenticated finite AI HTTP endpoint. Deployment bundles shared schemas and domain prompts.
 * [POS]: Edge composition root. Platform keys never enter client configuration.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHostedHandler } from './handler.ts'
const url = Deno.env.get('SUPABASE_URL') ?? ''
Deno.serve(createHostedHandler({
  url, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  providerKey: Deno.env.get('HOSTED_AI_OPENROUTER_KEY') ?? '',
  environment: Deno.env.get('HOSTED_AI_ENVIRONMENT') ?? (url === 'https://asqyvcnxdltzzfutbbqy.supabase.co' ? 'development' : url === 'https://keqprrgvcefqdwnxaafv.supabase.co' ? 'production' : ''),
}))
