/**
 * [INPUT]: Zod, lightweight locale/language values and minimum runtime diagnostics.
 * [OUTPUT]: Language preference validation, RuntimeInfo, LanguageState and the fixed GoalloomApi with bounded read methods.
 * [POS]: Shared main/preload/renderer boundary without generic IPC, SQL or file access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { languages, locales, type Language } from '../i18n/locale'
import type { CommandInput, CommandReply, CommandResult } from './commands'
import type { ItemDetail, ItemPage, Query, Snapshot, ActivitySummary, ItemCounts, BackupSummary } from './queries'
import type { Activity, HistoryIndex, HistoryPage } from './history'
import type { BatchSummary, BatchPage, DataAction, DataReply } from './transfer'
import type { SmartAction, SmartReply } from './smart-input'

export const runtimeChannel = 'goalloom:runtime'
export const runtimeInfoSchema = z.strictObject({
  electron: z.string().min(1),
  node: z.string().min(1),
  sqlite: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.string().min(1),
})

export type RuntimeInfo = z.infer<typeof runtimeInfoSchema>
export const languageChannel = 'goalloom:language'
export const languageSchema = z.enum(languages)
export const languageStateSchema = z.strictObject({ language: languageSchema, locale: z.enum(locales), system: z.enum(locales) })
export type LanguageState = z.infer<typeof languageStateSchema>
export interface GoalloomApi {
  getRuntime(): Promise<RuntimeInfo>
  getLanguage(): Promise<LanguageState>
  setLanguage(language: Language): Promise<LanguageState>
  getSnapshot(): Promise<Snapshot>
  getItem(itemId: string): Promise<ItemDetail>
  listItems(query: Extract<Query, { type: 'list' }>): Promise<ItemPage>
  getHistory(query: Extract<Query, { type: 'history' }>): Promise<HistoryPage>
  getHistoryIndex(horizon: Extract<Query, { type: 'historyIndex' }>['horizon']): Promise<HistoryIndex>
  getActivity(query: Extract<Query, { type: 'activity' }>): Promise<Activity>
  getBatches(): Promise<BatchSummary[]>
  getBatchItems(query: Extract<Query, { type: 'batchItems' }>): Promise<BatchPage>
  getCounts(): Promise<ItemCounts>
  getBackupSummary(): Promise<BackupSummary>
  getActivitySummary(itemId: string): Promise<ActivitySummary>
  data(action: DataAction): Promise<DataReply>
  onChanged(listener: (result: CommandResult | null) => void): () => void
  execute(command: CommandInput): Promise<CommandReply>
  getReceipt(operationId: string, generation: string): Promise<CommandResult | null>
  exportWorkspace(): Promise<boolean>
  smart(action: SmartAction): Promise<SmartReply>
}
