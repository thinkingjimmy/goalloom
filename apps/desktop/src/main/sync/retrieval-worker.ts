/**
 * [INPUT]: Main-only finite messages, an isolated temporary database and already verified/redacted operations.
 * [OUTPUT]: Exact baseline projection and ready-only bounded copy reads; no sync/settings/AI/reconcile side effects.
 * [POS]: Disposable retained-copy worker. It never opens the active workspace or receives a workspace key.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { parseSyncOp, retrievalManifestSchema } from '@goalloom/contracts'
import { bindWorkspace, type RetrievedOperation } from '@goalloom/sync'
import { assertSeedBoundary, readSeedState, mergeRemoteOps } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { openDatabase, verifyDatabase } from '../storage/database'
import { migrate } from '../storage/schema'
import { Store } from '../storage/store'
import { syncHost } from './host'
import { exportDataset } from '../workspace/transfer/dataset'
import { validateDataset } from '../../domain/import-validation'

let ready = workerData.ready === true
let db = ready ? new DatabaseSync(String(workerData.path), { readOnly: true, allowExtension: false }) : openDatabase(String(workerData.path))
if (!ready) migrate(db)
const driver = nodeSqlDriver(db)
if (!ready) bindWorkspace(driver, { workspaceId: String(workerData.workspaceId), deviceId: String(workerData.deviceId), keyEpoch: 1 }, String(workerData.now))
if (!ready) db.exec('CREATE TABLE retrieval_hashes(seq INTEGER PRIMARY KEY, originalPayloadHash TEXT NOT NULL) STRICT')
const messageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('append'), operations: z.array(z.strictObject({ seq: z.number().int().positive(), originalPayloadHash: z.string().regex(/^[0-9a-f]{64}$/), op: z.unknown() })).max(200) }),
  z.strictObject({ type: z.literal('finish'), manifest: retrievalManifestSchema, verifiedAt: z.string() }),
  z.strictObject({ type: z.literal('dataset') }),
  z.strictObject({ type: z.literal('inspect'), offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100) }),
  z.strictObject({ type: z.literal('close') }),
])
let tail: Promise<unknown> = Promise.resolve()
parentPort!.on('message', (message: { id: number; argument: unknown }) => {
  tail = tail.then(() => {
    try {
      const action = messageSchema.parse(message.argument)
      let value: unknown = null
      if (action.type === 'append') {
        if (ready) throw Error('copy_already_ready')
        const ops = action.operations.map(row => ({ ...row, op: parseSyncOp(row.op) })) as RetrievedOperation[]
        driver.transaction(() => {
          const nested = { ...driver, transaction: <T>(run: () => T): T => run() }
          mergeRemoteOps(nested, ops, syncHost(db), String(workerData.now), { deferIncompleteSeed: true })
          for (const row of ops) db.prepare('INSERT INTO retrieval_hashes VALUES (?,?)').run(row.seq, row.originalPayloadHash)
        })
      } else if (action.type === 'finish') {
        if (ready) throw Error('copy_already_ready')
        const manifest = action.manifest, seed = readSeedState(driver, 'base')
        if (manifest.initialization) {
          if (!seed || seed.phase !== 'complete' || manifest.initialization.finalSeq !== seed.manifest.chunks + 2) throw Error('copy_incomplete_seed')
          assertSeedBoundary(driver, manifest.initialization)
        } else if (seed) throw Error('copy_unbound_seed')
        if (Number(db.prepare('SELECT count(*) AS n FROM retrieval_hashes').get()?.n) !== manifest.operationCount) throw Error('copy_incomplete_history')
        const data = exportDataset(new Store(db), action.verifiedAt)
        data.historyMode = 'baseline'; data.operations = []; data.events = []; data.undoEffects = []
        validateDataset(data, action.verifiedAt)
        db.exec('PRAGMA secure_delete=ON; DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops; DELETE FROM sync_settings; DELETE FROM sync_seed_state; DELETE FROM sync_active_binding; VACUUM')
        db.exec("CREATE TABLE retrieval_copy(id INTEGER PRIMARY KEY CHECK(id=1), historyMode TEXT NOT NULL CHECK(historyMode='baseline')) STRICT; INSERT INTO retrieval_copy VALUES (1,'baseline')")
        verifyDatabase(db)
        db.close(); db = new DatabaseSync(String(workerData.path), { readOnly: true, allowExtension: false }); ready = true
        value = { items: data.items.length, relations: data.relations.length, periods: data.periods.length, guidance: data.guidance.length }
      } else if (action.type === 'inspect') {
        if (!ready) throw Error('copy_not_ready')
        value = { type: 'items', total: Number(db.prepare('SELECT count(*) AS n FROM items').get()?.n), items: db.prepare('SELECT i.id,i.title,i.description,i.status,p.horizon,i.archivedAt IS NOT NULL AS archived,i.deletedAt IS NOT NULL AS deleted FROM items i JOIN item_placements p ON p.itemId=i.id ORDER BY i.id LIMIT ? OFFSET ?').all(action.limit, action.offset).map(row => ({ ...row, archived: Boolean(row.archived), deleted: Boolean(row.deleted) })) }
      } else if (action.type === 'dataset') {
        if (!ready) throw Error('copy_not_ready')
        const data = exportDataset(new Store(db), String(workerData.now))
        data.historyMode = 'baseline'; data.operations = []; data.events = []; data.undoEffects = []
        value = data
      } else { db.close() }
      parentPort!.postMessage({ id: message.id, ok: true, value })
    } catch (error) { parentPort!.postMessage({ id: message.id, ok: false, code: 'retrieval_data_unavailable', diagnostic: error instanceof Error ? error.message.slice(0, 400) : 'copy_failed' }) }
  })
})
