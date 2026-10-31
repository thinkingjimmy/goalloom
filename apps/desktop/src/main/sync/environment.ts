/**
 * [INPUT]: Production profile and serialized storage worker before any network client starts.
 * [OUTPUT]: Protected one-time local transition and a separate production credential directory.
 * [POS]: Environment handoff. Legacy vaults remain in place and are never opened for production.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageClient } from '../storage/client'
import { atomicJson } from '../storage/atomic-json'
import { productionRef } from './config'

export async function prepareProductionProfile(profile: string, storage: StorageClient): Promise<string> {
  const directory = join(profile, 'sync', productionRef)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const marker = join(directory, 'transition.json')
  try {
    const saved = JSON.parse(await readFile(marker, 'utf8'))
    if (saved.project !== productionRef || saved.version !== 1) throw Error('Invalid production transition receipt')
    return directory
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const at = new Date().toISOString()
  const backup = await storage.call<string>('sync', { type: 'protect', at })
  const result = await storage.call('sync', { type: 'production-transition', at })
  // No network client exists until this receipt is durable. An interrupted receipt can safely rebaseline again.
  await atomicJson(marker, { version: 1, project: productionRef, at, backup, result })
  return directory
}
