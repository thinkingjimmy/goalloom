/**
 * [INPUT]: A fixed device directory, OS-protected cipher and bounded provider/feature schemas.
 * [OUTPUT]: Device configuration v3, encrypted keys and preserved v1/v2 settings with empty new purpose consent.
 * [POS]: Device-only AI persistence; keys and consent never enter workspace data or backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { aiProviderSchema, failureSchema, noticeSchema, type AiProvider } from '../../shared/contracts/smart-input'
import { aiProviders } from '../../shared/contracts/values'
import { atomicJson } from '../storage/atomic-json'

export interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(data: Buffer): string }
const stamp = z.string().nullable()
const providerConfig = z.strictObject({ consentedAt: stamp, verifiedAt: stamp, keyHint: z.string().max(12).nullable(), capabilities: z.strictObject({ jev: stamp, chat: stamp }), lastFailure: failureSchema.nullable(), assistanceConsent: z.strictObject({ version: z.literal(1), at: z.iso.datetime({ offset: true }) }).nullable().default(null) })
const featureConfig = z.strictObject({ provider: aiProviderSchema.nullable(), revision: z.number().int().nonnegative(), enabledForGeneration: z.string().nullable() })
export type ProviderConfig = z.infer<typeof providerConfig>
export type FeatureConfig = z.infer<typeof featureConfig>
export const deviceConfigSchema = z.strictObject({
  version: z.literal(3), providers: z.strictObject({ openrouter: providerConfig, 'vercel-gateway': providerConfig }),
  features: z.strictObject({ smart: featureConfig, insight: featureConfig }), dismissed: z.array(noticeSchema),
})
export type DeviceConfig = z.infer<typeof deviceConfigSchema>
export const blankProvider = (): ProviderConfig => ({ consentedAt: null, verifiedAt: null, keyHint: null, capabilities: { jev: null, chat: null }, lastFailure: null, assistanceConsent: null })
const blankFeature = (): FeatureConfig => ({ provider: null, revision: 0, enabledForGeneration: null })
const empty = (): DeviceConfig => ({ version: 3, providers: { openrouter: blankProvider(), 'vercel-gateway': blankProvider() },
  features: { smart: blankFeature(), insight: blankFeature() }, dismissed: [] })

// --- The TypeSafe native channel was retired: its entry is dropped and a feature bound to it switches off with a new revision. ---
const retired = 'typesafe'
const storedProvider = z.enum([...aiProviders, retired])
const storedFeature = featureConfig.extend({ provider: storedProvider.nullable() })
const withRetired = deviceConfigSchema.extend({
  version: z.union([z.literal(2), z.literal(3)]),
  providers: z.strictObject({ openrouter: providerConfig, 'vercel-gateway': providerConfig, [retired]: providerConfig.optional() }),
  features: z.strictObject({ smart: storedFeature, insight: storedFeature }),
})
const current = (feature: z.infer<typeof storedFeature>): FeatureConfig => feature.provider === retired
  ? { provider: null, revision: feature.revision + 1, enabledForGeneration: null } : { ...feature, provider: feature.provider }
function mentionsRetired(raw: unknown): boolean {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as { providers?: object; activeProvider?: unknown; features?: Record<string, { provider?: unknown }> }
  return retired in (value.providers ?? {}) || value.activeProvider === retired || Object.values(value.features ?? {}).some(feature => feature?.provider === retired)
}

// --- Version 1 kept one active Jev service; insight implicitly rode on a consented OpenRouter key under the same switch. ---
const legacyProvider = z.object({ consentedAt: stamp, verifiedAt: stamp, keyHint: z.string().max(12).nullable() })
const legacySchema = z.object({
  version: z.literal(1), activeProvider: storedProvider.nullable(), providerRevision: z.number().int().nonnegative(), enabledForGeneration: z.string().nullable(),
  providers: z.object({ [retired]: legacyProvider.optional(), 'vercel-gateway': legacyProvider, openrouter: legacyProvider.optional() }), dismissed: z.array(noticeSchema),
})
function upgrade(raw: unknown): DeviceConfig {
  const parsed = deviceConfigSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  const stored = withRetired.safeParse(raw)
  if (stored.success) {
    const { openrouter, 'vercel-gateway': gateway } = stored.data.providers
    return { ...stored.data, version: 3, providers: { openrouter, 'vercel-gateway': gateway }, features: { smart: current(stored.data.features.smart), insight: current(stored.data.features.insight) } }
  }
  const old = legacySchema.parse(raw), config = empty()
  for (const provider of aiProviders) {
    const value = old.providers[provider]
    if (value) config.providers[provider] = { ...value, capabilities: { jev: value.verifiedAt, chat: null }, lastFailure: null, assistanceConsent: null }
  }
  config.features.smart = current({ provider: old.activeProvider, revision: old.providerRevision, enabledForGeneration: old.enabledForGeneration })
  const openrouter = config.providers.openrouter
  // Insight's model was never tested separately; keep it on for the same generation and let the first failure surface on the provider.
  if (openrouter.consentedAt && openrouter.verifiedAt) {
    openrouter.capabilities.chat = openrouter.verifiedAt
    config.features.insight = { provider: 'openrouter', revision: 0, enabledForGeneration: old.enabledForGeneration }
  }
  config.dismissed = old.dismissed
  return config
}
export type KeyRead = { state: 'saved'; key: string } | { state: 'missing' | 'unreadable' | 'unavailable' }
export class CredentialError extends Error { constructor(readonly state: 'unavailable') { super('系统凭据保护不可用') } }

export class DeviceStore {
  constructor(readonly directory: string, private readonly cipher: Cipher) {}
  private keyPath(provider: AiProvider): string { return join(this.directory, `${aiProviderSchema.parse(provider)}.key`) }
  async config(): Promise<DeviceConfig> {
    let raw: unknown
    try { raw = JSON.parse(await readFile(join(this.directory, 'config.json'), 'utf8')) } catch { return empty() }
    // The retired channel's encrypted key has no remaining reader, so it is deleted rather than left on disk.
    if (mentionsRetired(raw)) await rm(join(this.directory, `${retired}.key`), { force: true }).catch(() => undefined)
    try { return upgrade(raw) } catch { return empty() }
  }
  async saveConfig(config: DeviceConfig): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await atomicJson(join(this.directory, 'config.json'), deviceConfigSchema.parse(config))
  }
  async saveKey(provider: AiProvider, key: string): Promise<string> {
    if (!this.cipher.available()) throw new CredentialError('unavailable')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const path = this.keyPath(provider), temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, this.cipher.encrypt(key), { mode: 0o600, flag: 'wx' }); await rename(temporary, path) }
    finally { await rm(temporary, { force: true }).catch(() => undefined) }
    return `••••${key.slice(-4)}`
  }
  async readKey(provider: AiProvider): Promise<KeyRead> {
    let data: Buffer
    try { data = await readFile(this.keyPath(provider)) } catch { return { state: 'missing' } }
    if (!this.cipher.available()) return { state: 'unavailable' }
    // A denied Keychain prompt or a changed app identity lands here; the encrypted file stays for a later retry.
    try { return { state: 'saved', key: this.cipher.decrypt(data) } } catch { return { state: 'unreadable' } }
  }
  async removeKey(provider: AiProvider): Promise<void> { await rm(this.keyPath(provider), { force: true }) }
}
