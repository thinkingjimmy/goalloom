/**
 * [INPUT]: Sandboxed Electron bridge and shared wire schemas.
 * [OUTPUT]: Fixed window.goalloom API with validated responses and optional numeric timings.
 * [POS]: Only renderer/main bridge; no Node capabilities, generic channels or file paths.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { z } from 'zod'
import { beginValidationMetrics, endValidationMetrics } from '../shared/contracts/validation-metrics'
import { contextBridge, ipcRenderer } from 'electron'
import { languageChannel, languageStateSchema, runtimeChannel, runtimeInfoSchema, type GoalloomApi } from '../shared/contracts/runtime'
import { activitySummarySchema, backupSummarySchema, itemCountsSchema, detailSchema, itemPageSchema, snapshotSchema } from '../shared/contracts/queries'
import { replySchema, resultSchema } from '../shared/contracts/commands'
import { activitySchema, historyPageSchema } from '../shared/contracts/history'
import { batchPageSchema, batchSchema, dataReplySchema } from '../shared/contracts/transfer'
import { smartChannel, smartReplySchema } from '../shared/contracts/smart-input'
import { setValidationLocale } from '../shared/i18n/validation'

async function language(reply: Promise<unknown>) {
  const state = languageStateSchema.parse(await reply)
  setValidationLocale(state.locale)
  return state
}

async function query<T>(input: unknown, schema: z.ZodType<T>): Promise<T> {
  const start = performance.now()
  const reply = await ipcRenderer.invoke('goalloom:query', input) as { value: unknown; trace: string | null }
  const received = performance.now()
  beginValidationMetrics(Boolean(reply.trace))
  const value = schema.parse(reply.value)
  const parsed = performance.now(), dates = endValidationMetrics()
  if (reply.trace) console.debug('goalloom:performance', JSON.stringify({ stage: 'preload', trace: reply.trace, invokeMs: received - start, parseMs: parsed - received, ...dates }))
  return value
}

const readQuery = query
const api: GoalloomApi = {
  getRuntime: async () => runtimeInfoSchema.parse(await ipcRenderer.invoke(runtimeChannel)),
  getLanguage: () => language(ipcRenderer.invoke(languageChannel)),
  setLanguage: input => language(ipcRenderer.invoke(languageChannel, input)),
  getSnapshot: async () => query({ type: 'snapshot' }, snapshotSchema),
  getItem: async itemId => query({ type: 'item', itemId }, detailSchema),
  listItems: async query => readQuery(query, itemPageSchema),
  getHistory: async query => readQuery(query, historyPageSchema),
  getActivity: async query => readQuery(query, activitySchema),
  getBatches: async () => query({ type: 'batches' }, batchSchema.array()),
  getBackupSummary: async () => query({ type: 'backupSummary' }, backupSummarySchema),
  getCounts: async () => query({ type: 'counts' }, itemCountsSchema),
  getActivitySummary: async itemId => query({ type: 'activitySummary', itemId }, activitySummarySchema),
  getBatchItems: async input => query(input, batchPageSchema),
  data: async action => dataReplySchema.parse(await ipcRenderer.invoke('goalloom:data', action)),
  onChanged: listener => {
    const receive = (_event: unknown, value: unknown) => { const parsed = resultSchema.nullable().safeParse(value); if (parsed.success) listener(parsed.data) }
    ipcRenderer.on('goalloom:changed', receive)
    return () => { ipcRenderer.removeListener('goalloom:changed', receive) }
  },
  execute: async command => replySchema.parse(await ipcRenderer.invoke('goalloom:command', command)),
  getReceipt: async (operationId, generation) => query({ type: 'receipt', operationId, generation }, resultSchema.nullable()),
  exportWorkspace: async () => Boolean(await ipcRenderer.invoke('goalloom:export')),
  smart: async action => smartReplySchema.parse(await ipcRenderer.invoke(smartChannel, action)),
}
contextBridge.exposeInMainWorld('goalloom', Object.freeze(api))
