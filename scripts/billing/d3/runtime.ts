/**
 * [INPUT]: Existing billing/lifecycle production modules and synthetic fixture crypto.
 * [OUTPUT]: Original runtime constructors and fixture creation helpers for scoped D3 preparation/cleanup.
 * [POS]: Local acceptance bundle entry; contains no alternate business rules or deployment side effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export { BillingService } from '../../../supabase/functions/billing/service.ts'
export { BillingProviders } from '../../../supabase/functions/billing/providers.ts'
export { runtimeConfig, validateConfig } from '../../../supabase/functions/billing/config.ts'
export { workerScopeGuard, createLifecycleWorker } from '../../../supabase/functions/lifecycle/worker.ts'
export { projectStorage, projectAuth } from '../../../supabase/functions/lifecycle/storage.ts'
export { replayDeletionLedger } from '../../../supabase/functions/lifecycle/restore.ts'
export { fixtureSecrets, fixtureCreation } from '../../lifecycle/fixture-crypto.ts'
