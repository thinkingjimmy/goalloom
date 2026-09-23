/**
 * [INPUT]: main 固定的设备目录（userData/smart-input）、注入的 OS 保护 Cipher（Electron safeStorage 或测试替身）。
 * [OUTPUT]: DeviceStore：每服务加密 Key 文件与遮罩提示、区分 missing/unreadable/unavailable 的读取；设备配置 activeProvider/providerRevision/enabledForGeneration/同意/提示关闭状态的原子读写。
 * [POS]: 智能输入的设备侧持久化；不进入业务 SQLite、workspace 表、导出/备份或迁移；绝不明文回退，读取失败保留加密文件供重试。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { failureSchema, jevProviderSchema, noticeSchema, type JevProvider } from '../../shared/contracts/smart-input'
import { atomicJson } from '../storage/atomic-json'

export interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(data: Buffer): string }
const providerConfig = z.strictObject({ consentedAt: z.string().nullable(), verifiedAt: z.string().nullable(), keyHint: z.string().max(12).nullable() })
export const deviceConfigSchema = z.strictObject({
  version: z.literal(1), activeProvider: jevProviderSchema.nullable(), providerRevision: z.number().int().nonnegative(), enabledForGeneration: z.string().nullable(),
  providers: z.strictObject({ typesafe: providerConfig, 'vercel-gateway': providerConfig }), dismissed: z.array(noticeSchema), lastFailure: failureSchema.nullable(),
})
export type DeviceConfig = z.infer<typeof deviceConfigSchema>
const empty = (): DeviceConfig => ({ version: 1, activeProvider: null, providerRevision: 0, enabledForGeneration: null, dismissed: [], lastFailure: null,
  providers: { typesafe: { consentedAt: null, verifiedAt: null, keyHint: null }, 'vercel-gateway': { consentedAt: null, verifiedAt: null, keyHint: null } } })
export type KeyRead = { state: 'saved'; key: string } | { state: 'missing' | 'unreadable' | 'unavailable' }
export class CredentialError extends Error { constructor(readonly state: 'unavailable') { super('系统凭据保护不可用') } }

export class DeviceStore {
  constructor(readonly directory: string, private readonly cipher: Cipher) {}
  private keyPath(provider: JevProvider): string { return join(this.directory, `${jevProviderSchema.parse(provider)}.key`) }
  async config(): Promise<DeviceConfig> {
    try { return deviceConfigSchema.parse(JSON.parse(await readFile(join(this.directory, 'config.json'), 'utf8'))) }
    catch { return empty() }
  }
  async saveConfig(config: DeviceConfig): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await atomicJson(join(this.directory, 'config.json'), deviceConfigSchema.parse(config))
  }
  async saveKey(provider: JevProvider, key: string): Promise<string> {
    if (!this.cipher.available()) throw new CredentialError('unavailable')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const path = this.keyPath(provider), temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, this.cipher.encrypt(key), { mode: 0o600, flag: 'wx' }); await rename(temporary, path) }
    finally { await rm(temporary, { force: true }).catch(() => undefined) }
    return `••••${key.slice(-4)}`
  }
  async readKey(provider: JevProvider): Promise<KeyRead> {
    let data: Buffer
    try { data = await readFile(this.keyPath(provider)) } catch { return { state: 'missing' } }
    if (!this.cipher.available()) return { state: 'unavailable' }
    // A denied Keychain prompt or a changed app identity lands here; the encrypted file stays for a later retry.
    try { return { state: 'saved', key: this.cipher.decrypt(data) } } catch { return { state: 'unreadable' } }
  }
  async removeKey(provider: JevProvider): Promise<void> { await rm(this.keyPath(provider), { force: true }) }
}
