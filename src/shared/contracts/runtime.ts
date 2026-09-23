/**
 * [INPUT]: zod 的运行时校验；main 提供的最小诊断数据。
 * [OUTPUT]: RuntimeInfo DTO 与固定读写 GoalloomApi，不暴露通用 IPC。
 * [POS]: main/preload/renderer 共同边界；不暴露路径、SQL 或原始 IPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'
import type { CommandInput, CommandReply, CommandResult } from './commands'
import type { ItemDetail, ItemPage, Query, Snapshot } from './queries'
import type { Activity, HistoryPage } from './history'
import type { BatchSummary, DataAction, DataReply } from './transfer'

export const runtimeChannel = 'goalloom:runtime'
export const runtimeInfoSchema = z.strictObject({
  electron: z.string().min(1),
  node: z.string().min(1),
  sqlite: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.string().min(1),
})

export type RuntimeInfo = z.infer<typeof runtimeInfoSchema>
export interface GoalloomApi {
  getRuntime(): Promise<RuntimeInfo>
  getSnapshot(): Promise<Snapshot>
  getItem(itemId: string): Promise<ItemDetail>
  listItems(query: Extract<Query, { type: 'list' }>): Promise<ItemPage>
  getHistory(query: Extract<Query, { type: 'history' }>): Promise<HistoryPage>
  getActivity(query: Extract<Query, { type: 'activity' }>): Promise<Activity>
  getBatches(): Promise<BatchSummary[]>
  data(action: DataAction): Promise<DataReply>
  onChanged(listener: (result: CommandResult | null) => void): () => void
  execute(command: CommandInput): Promise<CommandReply>
  getReceipt(operationId: string, generation: string): Promise<CommandResult | null>
  exportWorkspace(): Promise<boolean>
}
