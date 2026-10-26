// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Environment-bound Edge Secrets, Supabase credentials and authenticated development worker scopes.
 * [OUTPUT]: Trusted billing HTTP endpoint with request-local scoped development worker RPCs.
 * [POS]: D0–D3 composition root over the original subject-aware billing and settlement engine.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { runtimeConfig } from './config.ts'
import { createBillingEndpoint } from './endpoint.ts'
Deno.serve(createBillingEndpoint(runtimeConfig(name => Deno.env.get(name))))
