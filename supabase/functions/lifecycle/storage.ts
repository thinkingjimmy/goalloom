// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Fixed project service credentials and an exact closed workspace namespace.
 * [OUTPUT]: Bounded recursive inventory, scoped removal and independently checked absence.
 * [POS]: Storage/Auth transport. Unknown network outcomes remain unfinished durable work.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { body, configure, LifecycleError, object, uuid, type LifecycleConfig } from './http.ts'
type Frame = { prefix: string; offset: number }
export type InventoryCursor = { version: 1; frames: Frame[] }
export type InventoryPage = { paths: string[]; cursor: InventoryCursor | null; done: boolean }
export interface ObjectStore {
  inventory(workspace: string, cursor: unknown): Promise<InventoryPage>
  remove(workspace: string, path: string): Promise<boolean>
}
export interface AuthStore { remove(owner: string): Promise<boolean> }
const failure = () => new LifecycleError('lifecycle_unavailable')
export function scopedPath(workspace: string, path: string): boolean {
  return uuid.test(workspace) && path.startsWith(`workspaces/${workspace}/`) && path.length <= 1024
    && !path.includes('..') && !path.includes('\\') && !path.includes('//') && !/[\u0000-\u001f]/.test(path)
}
export function projectStorage(config: LifecycleConfig): ObjectStore {
  const http = configure(config)
  const headers = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, 'content-type': 'application/json' }
  const request = (path: string, init: RequestInit = {}) => http(`${config.url}${path}`, {
    ...init, headers, signal: AbortSignal.timeout(10000), redirect: 'error',
  })
  const missing = async (response: Response): Promise<boolean> => {
    if (response.status === 404) return true
    if (response.status !== 400) return false
    const error = await body(response, 4096) as Record<string, unknown>
    return ['NoSuchKey','not_found'].includes(String(error.code ?? error.error))
  }
  return {
    async inventory(workspace, input) {
      if (!uuid.test(workspace)) throw failure()
      const root = `workspaces/${workspace}`
      let frames: Frame[]
      if (input === null) frames = [{ prefix: root, offset: 0 }]
      else {
        const cursor = object(input, ['version','frames'])
        if (cursor.version !== 1 || !Array.isArray(cursor.frames) || cursor.frames.length < 1 || cursor.frames.length > 16) throw failure()
        frames = cursor.frames.map(value => {
          const frame = object(value, ['prefix','offset'])
          if (typeof frame.prefix !== 'string' || frame.prefix !== root && !scopedPath(workspace, `${frame.prefix}/x`)
            || !Number.isSafeInteger(frame.offset) || Number(frame.offset) < 0) throw failure()
          return { prefix: frame.prefix, offset: Number(frame.offset) }
        })
        if (frames[0].prefix !== root || frames.some((frame, i) => i > 0 && !frame.prefix.startsWith(`${frames[i-1].prefix}/`))) throw failure()
      }
      const frame = frames.at(-1)!
      const response = await request('/storage/v1/object/list/snapshots', { method: 'POST', body: JSON.stringify({
        prefix: frame.prefix, limit: 50, offset: frame.offset, sortBy: { column: 'name', order: 'asc' },
      }) })
      if (!response.ok) throw failure()
      const rows = await body(response, 128 * 1024)
      if (!Array.isArray(rows) || rows.length > 50) throw failure()
      const paths: string[] = []
      let entered = false
      for (const value of rows) {
        const row = value as { name?: unknown; id?: unknown; metadata?: unknown }
        if (typeof row.name !== 'string' || !row.name || row.name.includes('/') || row.name === '.' || row.name === '..') throw failure()
        const path = `${frame.prefix}/${row.name}`
        if (!scopedPath(workspace, path)) throw failure()
        frame.offset++
        if (row.id === null && row.metadata === null) {
          if (frames.length >= 16) throw failure()
          frames.push({ prefix: path, offset: 0 }); entered = true; break
        }
        if (typeof row.id !== 'string' || !row.id) throw failure()
        paths.push(path)
      }
      if (!entered && rows.length < 50) frames.pop()
      return { paths, cursor: frames.length ? { version: 1, frames } : null, done: frames.length === 0 }
    },
    async remove(workspace: string, path: string) {
      if (!scopedPath(workspace, path)) throw failure()
      await request('/storage/v1/object/snapshots', { method: 'DELETE', body: JSON.stringify({ prefixes: [path] }) }).catch(() => undefined)
      const encoded = path.split('/').map(encodeURIComponent).join('/')
      const verified = await request(`/storage/v1/object/info/snapshots/${encoded}`)
      return missing(verified)
    },
  }
}
export function projectAuth(config: LifecycleConfig): AuthStore {
  const http = configure(config), headers = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, 'content-type': 'application/json' }
  return { async remove(owner) {
    if (!uuid.test(owner)) throw failure()
    const endpoint = `${config.url}/auth/v1/admin/users/${owner}`
    await http(endpoint, { method: 'DELETE', headers, body: JSON.stringify({ should_soft_delete: false }),
      signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => undefined)
    const verified = await http(endpoint, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' })
    return verified.status === 404
  } }
}
