// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Fixed project secrets, explicitly independent ledger and original billing configuration.
 * [OUTPUT]: Lifecycle HTTP plus a secret-authenticated bounded worker; incomplete config fails closed.
 * [POS]: D2 composition root. Scheduling and restore admission are separate operator launch gates.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { runtimeConfig, validateConfig } from '../billing/config.ts'
import { BillingProviders } from '../billing/providers.ts'
import { BillingService } from '../billing/service.ts'
import { createLifecycleHandler } from './handler.ts'
import { rpc, type LifecycleConfig } from './http.ts'
import { httpLedger } from './ledger.ts'
import { projectAuth, projectStorage } from './storage.ts'
import { createLifecycleWorker, workerScopeGuard } from './worker.ts'
const get = (name: string) => Deno.env.get(name)
const url = get('SUPABASE_URL') ?? ''
const config: LifecycleConfig = { url, serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  environment: url === 'https://asqyvcnxdltzzfutbbqy.supabase.co' ? 'development' : 'production', workerSecret: get('LIFECYCLE_WORKER_SECRET') }
Deno.serve(createLifecycleHandler(config, { worker: async () => {
  const call = rpc({ ...config, workerScope: get('LIFECYCLE_WORKER_SCOPE') })
  const ledger = httpLedger({ url: get('DELETION_LEDGER_URL') ?? '', token: get('DELETION_LEDGER_TOKEN') ?? '',
    storeId: get('DELETION_LEDGER_STORE_ID') ?? '', environment: config.environment })
  const settle = async (subject: string) => {
    const billing = runtimeConfig(get); validateConfig(billing)
    const providers = new BillingProviders(billing), service = new BillingService(billing, call, providers)
    await service.configured(); await providers.verifyConfiguration()
    return service.reconcile(subject)
  }
  return createLifecycleWorker({ environment: config.environment, rpc: call, ledger, storage: projectStorage(config), auth: projectAuth(config), settle,
    guard: workerScopeGuard(call,config.environment) })()
} }))
