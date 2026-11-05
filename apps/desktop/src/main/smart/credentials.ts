/**
 * [INPUT]: A fixed device directory, OS-protected cipher, shared operator-consent version and bounded provider/feature schemas.
 * [OUTPUT]: Device configuration v3, preserved encrypted BYOK keys and account/scope-bound hosted consent and feature selection.
 * [POS]: Device-only AI persistence. Keys stay in the OS cipher on disk. The workspace database stores a sha256 fingerprint. The sealed pref.set is built in memory from the keychain.
 */
import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { aiProviderSchema, failureSchema, noticeSchema, type AiProvider } from '../../shared/contracts/smart-input'
import { hostedScopeVersion } from '../../shared/contracts/values'
import { atomicJson } from '../storage/atomic-json'

export interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(data: Buffer): string }
const stamp = z.string().nullable()
const providerConfig = z.strictObject({ consentedAt: stamp, verifiedAt: stamp, keyHint: z.string().max(12).nullable(), capabilities: z.strictObject({ jev: stamp, chat: stamp }), lastFailure: failureSchema.nullable(), assistanceConsent: z.strictObject({ version: z.literal(1), at: z.iso.datetime({ offset: true }) }).nullable() })
const featureConfig = z.strictObject({ provider: aiProviderSchema.nullable(), revision: z.number().int().nonnegative(), enabledForGeneration: z.string().nullable() })
export type ProviderConfig = z.infer<typeof providerConfig>
export type FeatureConfig = z.infer<typeof featureConfig>
export const deviceConfigSchema = z.strictObject({
  version: z.literal(3), providers: z.strictObject({ openrouter: providerConfig, 'vercel-gateway': providerConfig, hosted: providerConfig }),
  features: z.strictObject({ smart: featureConfig, insight: featureConfig }), dismissed: z.array(noticeSchema),
})
export type DeviceConfig = z.infer<typeof deviceConfigSchema>
export const blankProvider = (): ProviderConfig => ({ consentedAt: null, verifiedAt: null, keyHint: null, capabilities: { jev: null, chat: null }, lastFailure: null, assistanceConsent: null })
const blankFeature = (): FeatureConfig => ({ provider: null, revision: 0, enabledForGeneration: null })
const empty = (): DeviceConfig => ({ version: 3, providers: { openrouter: blankProvider(), 'vercel-gateway': blankProvider(), hosted: blankProvider() },
  features: { smart: blankFeature(), insight: blankFeature() }, dismissed: [] })

export type KeyRead = { state: 'saved'; key: string } | { state: 'missing' | 'unreadable' | 'unavailable' }
export class CredentialError extends Error { constructor(readonly state: 'unavailable') { super('系统凭据保护不可用') } }

export class DeviceStore {
  constructor(readonly directory: string, private readonly cipher: Cipher, private readonly account: () => string | null = () => null) {}
  accountId(): string | null { return this.account() }
  private owners = new WeakMap<DeviceConfig, string | null>()
  private async readConfig(): Promise<DeviceConfig> {

    try { return deviceConfigSchema.parse(JSON.parse(await readFile(join(this.directory, 'config.json'), 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty()
      throw new Error('Unsupported AI configuration; original files were kept')
    }
  }
  async config(): Promise<DeviceConfig> {
    const accountId = this.account(), config = await this.readConfig()
    if (accountId) {
      try {
        const saved = z.strictObject({ scope: z.literal(hostedScopeVersion), provider: providerConfig, features: z.strictObject({ smart: featureConfig.nullable(), insight: featureConfig.nullable() }) }).parse(JSON.parse(await readFile(join(this.directory, `hosted-${accountId}.json`), 'utf8')))
        config.providers.hosted = saved.provider
        for (const feature of ['smart', 'insight'] as const) if (saved.features[feature]) config.features[feature] = saved.features[feature]!
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Unsupported AI configuration; original files were kept')
        config.providers.hosted = blankProvider()
      }
    } else config.providers.hosted = blankProvider()
    if (accountId !== this.account()) return this.config()
    this.owners.set(config, accountId)
    return config
  }
  async activateAccount(): Promise<void> { await this.saveConfig(await this.config()) }
  async saveConfig(config: DeviceConfig): Promise<void> {
    const owner = this.owners.has(config) ? this.owners.get(config) : this.account()
    if (owner !== this.account()) return
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const base = await this.readConfig()
    if (owner !== this.account()) return
    if (owner) await atomicJson(join(this.directory, `hosted-${owner}.json`), { scope: hostedScopeVersion, provider: config.providers.hosted,
      features: Object.fromEntries((['smart', 'insight'] as const).map(feature => [feature, config.features[feature].provider === 'hosted' ? config.features[feature] : null])) })
    for (const feature of ['smart', 'insight'] as const) base.features[feature] = config.features[feature].provider === 'hosted' ? { ...config.features[feature], enabledForGeneration: null } : config.features[feature]
    base.providers.openrouter = config.providers.openrouter; base.providers['vercel-gateway'] = config.providers['vercel-gateway']
    base.dismissed = config.dismissed
    await atomicJson(join(this.directory, 'config.json'), deviceConfigSchema.parse(base))
  }
  private keyPath(provider: AiProvider): string { return join(this.directory, `${aiProviderSchema.parse(provider)}.key`) }
  async saveKey(provider: AiProvider, key: string): Promise<string> {
    if (provider === 'hosted') throw new Error('Hosted credentials are server-owned')
    if (!this.cipher.available()) throw new CredentialError('unavailable')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const path = this.keyPath(provider), temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, this.cipher.encrypt(key), { mode: 0o600, flag: 'wx' }); await rename(temporary, path) }
    finally { await rm(temporary, { force: true }).catch(() => undefined) }
    return `••••${key.slice(-4)}`
  }
  async readKey(provider: AiProvider): Promise<KeyRead> {
    if (provider === 'hosted') return this.account() ? { state: 'saved', key: 'hosted-session' } : { state: 'missing' }
    let data: Buffer
    try { data = await readFile(this.keyPath(provider)) } catch { return { state: 'missing' } }
    if (!this.cipher.available()) return { state: 'unavailable' }
    // Noninteractive denial or a changed identity leaves the encrypted file for a later retry.
    try { return { state: 'saved', key: this.cipher.decrypt(data) } } catch { return { state: 'unreadable' } }
  }
  async removeKey(provider: AiProvider): Promise<void> { await rm(this.keyPath(provider), { force: true }) }
}
