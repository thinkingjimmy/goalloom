/**
 * [INPUT]: A fixed device preference path and validated local or synchronized values.
 * [OUTPUT]: Immediate placement policy, a projection revision guard, serialized atomic persistence and one-time renderer preference migration.
 * [POS]: Main-owned device state outside the workspace; available before startup reconciliation and retained across replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { atomicJson } from '../storage/atomic-json'

const preferenceSchema = z.strictObject({ enabled: z.boolean() })

export class ParentOrderPreference {
  private value: boolean | null = null
  private change = 0
  private writes = Promise.resolve()
  constructor(private readonly path: string) {}
  get enabled(): boolean { return this.value ?? false }
  get revision(): number { return this.change }
  async load(): Promise<void> {
    try { this.value = preferenceSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))).enabled }
    catch { /* First launch imports the existing renderer preference before reading the board. */ }
  }
  initialize(enabled: boolean): Promise<boolean> {
    return this.value === null ? this.set(enabled) : this.writes.then(() => this.enabled)
  }
  set(enabled: boolean): Promise<boolean> {
    this.value = enabled; this.change++
    const saved = this.writes.catch(() => undefined).then(() => atomicJson(this.path, { enabled }))
    this.writes = saved
    return saved.then(() => enabled)
  }
}
