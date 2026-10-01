/**
 * [INPUT]: Zod, lightweight locale/language values and minimum runtime diagnostics.
 * [OUTPUT]: Fixed GoalloomApi for selected-period reads, historical review contexts, editable past-task pages, immutable history, language preferences, bounded links/browser opening, software updates and a close-time drain callback.
 * [POS]: Shared main/preload/renderer boundary without generic IPC, SQL or file access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { languages, locales, type Language } from '../i18n/locale'
import type { CommandInput, CommandReply, CommandResult } from './commands'
import type { ItemDetail, ItemPage, Query, Snapshot, BoardPeriods, ReviewContext, ActivitySummary, ItemCounts, BackupSummary } from './queries'
import type { Activity, HistoryIndex, HistoryPage, PastPeriodPage } from './history'
import type { BatchSummary, BatchPage, DataAction, DataReply } from './transfer'
import type { SmartAction, SmartReply } from './smart-input'
import type { LinkPreview } from './link-preview'
import type { UpdateAction, UpdateInfo } from './update'

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
  getReviewContext(query: Extract<Query, { type: 'reviewContext' }>): Promise<ReviewContext>
  getBoardPeriods(query: Extract<Query, { type: 'boardPeriods' }>): Promise<BoardPeriods>
  getItem(itemId: string): Promise<ItemDetail>
  listItems(query: Extract<Query, { type: 'list' }>): Promise<ItemPage>
  getHistory(query: Extract<Query, { type: 'history' }>): Promise<HistoryPage>
  getPastPeriod(query: Extract<Query, { type: 'pastPeriod' }>): Promise<PastPeriodPage>
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
  getLinkPreview(url: string): Promise<LinkPreview>
  openExternal(url: string): Promise<boolean>
  update(action: UpdateAction): Promise<UpdateInfo>
  onUpdate(listener: (info: UpdateInfo) => void): () => void
  onOpenAbout(listener: () => void): () => void
  onBeforeClose(listener: () => Promise<boolean>): () => void
}
