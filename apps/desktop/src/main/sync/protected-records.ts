/**
 * [INPUT]: Main-owned purpose/path, protected cipher and schema-validated records.
 * [OUTPUT]: Serialized protected files with per-operation captured ciphers and a drain boundary; owners control Auth/session teardown.
 * [POS]: Privacy receipts and retired-context persistence. No renderer paths or generic read capability.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { atomicFile } from '../storage/atomic-json'
import type { Cipher } from '../smart/credentials'

export class ProtectedRecords<T> {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private path: string, private purpose: string, private cipher: Cipher | (() => Cipher), private parse: (input: unknown) => T) {}
  private capture(): Cipher { return typeof this.cipher === 'function' ? this.cipher() : this.cipher }
  private async read(cipher: Cipher): Promise<T | null> {
    let bytes: Buffer
    try { bytes = await readFile(this.path) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    const envelope = JSON.parse(cipher.decrypt(bytes)) as { purpose?: unknown; value?: unknown }
    if (envelope.purpose !== this.purpose || Object.keys(envelope).some(key => !['purpose', 'value'].includes(key))) throw Error('protected_record_scope')
    return this.parse(envelope.value)
  }
  private serialized<R>(work: () => Promise<R>): Promise<R> {
    const next = this.tail.then(work); this.tail = next.catch(() => undefined); return next
  }
  async settle(): Promise<void> { await this.tail }
  load(): Promise<T | null> { return this.serialized(() => this.read(this.capture())) }
  update(work: (current: T | null) => T): Promise<T> {
    return this.serialized(async () => {
      const cipher = this.capture()
      const value = this.parse(work(await this.read(cipher)))
      const bytes = cipher.encrypt(JSON.stringify({ purpose: this.purpose, value }))
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await atomicFile(this.path, file => file.writeFile(bytes))
      return value
    })
  }
}
