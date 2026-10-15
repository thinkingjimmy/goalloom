/**
 * [INPUT]: OS cipher and the device directory.
 * [OUTPUT]: Encrypted device/account keys and a public session-resume flag in one atomic file. Missing/inactive sessions can be checked without the OS cipher.
 * [POS]: Desktop secret store. Legacy bytes migrate only after successful decryption; unavailable access never replaces saved keys.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { hex, unhex, type RosterBody } from '@goalloom/crypto'
import { CredentialError, type Cipher } from '../smart/credentials'

const vaultHeader = Buffer.from('Goalloom sync vault 1\n')

const accountSchema = z.strictObject({
  deviceId: z.string().nullable(),
  workspaceKey: z.string().nullable(),
  workspaceId: z.string().nullable(),
  generation: z.string().nullable(),
  epoch: z.number().int().positive().nullable(),
  roster: z.unknown().nullable(),
  recoveryBoxSk: z.string().nullable().default(null),
  recoverySignSk: z.string().nullable().default(null),
})

const fileSchema = z.strictObject({
  v: z.literal(1),
  deviceId: z.string().nullable(),
  signSk: z.string(),
  boxSk: z.string(),
  workspaceKey: z.string().nullable(),
  workspaceId: z.string().nullable(),
  generation: z.string().nullable(),
  epoch: z.number().int().positive().nullable(),
  roster: z.unknown().nullable(),
  recoveryBoxSk: z.string().nullable().default(null),
  recoverySignSk: z.string().nullable().default(null),
  refreshToken: z.string().nullable(),
  userId: z.string().nullable().default(null),
  accounts: z.record(z.string(), accountSchema).default({}),
})

export interface AccountSecrets {
  deviceId: string | null
  workspaceKey: Uint8Array | null
  workspaceId: string | null
  generation: string | null
  epoch: number | null
  roster: RosterBody | null
  recoveryBoxSk: Uint8Array | null
  recoverySignSk: Uint8Array | null
}

export interface VaultSecrets {
  deviceId: string | null
  signSk: Uint8Array
  boxSk: Uint8Array
  workspaceKey: Uint8Array | null
  workspaceId: string | null
  generation: string | null
  epoch: number | null
  roster: RosterBody | null
  recoveryBoxSk: Uint8Array | null
  recoverySignSk: Uint8Array | null
  refreshToken: string | null
  userId: string | null
  accounts: Record<string, AccountSecrets>
}

export class SyncVault {
  constructor(private directory: string, private cipher: Cipher) {}
  get available(): boolean { return this.cipher.available() }
  async load({ resumeOnly = false, signal }: { resumeOnly?: boolean; signal?: AbortSignal } = {}): Promise<VaultSecrets | null> {
    let bytes: Buffer
    try { bytes = await readFile(join(this.directory, 'sync-vault.bin'), { signal }) }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null
      throw error
    }
    const legacy = !bytes.subarray(0, vaultHeader.length).equals(vaultHeader)
    if (!legacy) {
      const resume = bytes[vaultHeader.length]
      if (resume !== 0 && resume !== 1) throw new Error('Invalid sync vault header')
      if (resumeOnly && resume === 0) return null
      bytes = bytes.subarray(vaultHeader.length + 1)
    }
    if (!this.available) throw new CredentialError('unavailable')
    const parsed = fileSchema.parse(JSON.parse(this.cipher.decrypt(bytes)))
    const accounts: Record<string, AccountSecrets> = {}
    for (const [userId, account] of Object.entries(parsed.accounts)) {
      accounts[userId] = {
        deviceId: account.deviceId, workspaceKey: account.workspaceKey ? unhex(account.workspaceKey) : null,
        workspaceId: account.workspaceId, generation: account.generation, epoch: account.epoch, roster: account.roster as RosterBody | null,
        recoveryBoxSk: account.recoveryBoxSk ? unhex(account.recoveryBoxSk) : null,
        recoverySignSk: account.recoverySignSk ? unhex(account.recoverySignSk) : null,
      }
    }
    const secrets: VaultSecrets = {
      deviceId: parsed.deviceId, signSk: unhex(parsed.signSk), boxSk: unhex(parsed.boxSk),
      workspaceKey: parsed.workspaceKey ? unhex(parsed.workspaceKey) : null,
      workspaceId: parsed.workspaceId, generation: parsed.generation, epoch: parsed.epoch,
      roster: parsed.roster as RosterBody | null,
      recoveryBoxSk: parsed.recoveryBoxSk ? unhex(parsed.recoveryBoxSk) : null,
      recoverySignSk: parsed.recoverySignSk ? unhex(parsed.recoverySignSk) : null,
      refreshToken: parsed.refreshToken, userId: parsed.userId, accounts,
    }
    if (legacy) await this.save(secrets)
    return secrets
  }
  async save(secrets: VaultSecrets): Promise<void> {
    if (!this.available) throw new CredentialError('unavailable')
    const accounts: Record<string, z.infer<typeof accountSchema>> = {}
    for (const [userId, account] of Object.entries(secrets.accounts)) {
      accounts[userId] = {
        deviceId: account.deviceId, workspaceKey: account.workspaceKey ? hex(account.workspaceKey) : null,
        workspaceId: account.workspaceId, generation: account.generation, epoch: account.epoch, roster: account.roster,
        recoveryBoxSk: account.recoveryBoxSk ? hex(account.recoveryBoxSk) : null,
        recoverySignSk: account.recoverySignSk ? hex(account.recoverySignSk) : null,
      }
    }
    const body = JSON.stringify({
      v: 1, deviceId: secrets.deviceId, signSk: hex(secrets.signSk), boxSk: hex(secrets.boxSk),
      workspaceKey: secrets.workspaceKey ? hex(secrets.workspaceKey) : null,
      workspaceId: secrets.workspaceId, generation: secrets.generation, epoch: secrets.epoch,
      roster: secrets.roster,
      recoveryBoxSk: secrets.recoveryBoxSk ? hex(secrets.recoveryBoxSk) : null,
      recoverySignSk: secrets.recoverySignSk ? hex(secrets.recoverySignSk) : null,
      refreshToken: secrets.refreshToken, userId: secrets.userId, accounts,
    })
    const encrypted = this.cipher.encrypt(body)
    const path = join(this.directory, 'sync-vault.bin')
    await writeFile(`${path}.tmp`, Buffer.concat([vaultHeader, Buffer.from([secrets.refreshToken ? 1 : 0]), encrypted]), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }
  async clear(): Promise<void> {
    await rm(join(this.directory, 'sync-vault.bin'), { force: true })
  }
}
