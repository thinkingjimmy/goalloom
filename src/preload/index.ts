/**
 * [INPUT]: Electron 沙箱 contextBridge/ipcRenderer 和共享运行时 schema。
 * [OUTPUT]: 固定读写 window.goalloom；不暴露事件、通道参数或 Node API。
 * [POS]: renderer/main 间唯一桥接层，响应经 schema 复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { contextBridge, ipcRenderer } from 'electron'
import { runtimeChannel, runtimeInfoSchema, type GoalloomApi } from '../shared/contracts/runtime'
import { detailSchema, itemPageSchema, snapshotSchema } from '../shared/contracts/queries'
import { replySchema, resultSchema } from '../shared/contracts/commands'
import { activitySchema, historyPageSchema } from '../shared/contracts/history'

const api: GoalloomApi = {
  getRuntime: async () => runtimeInfoSchema.parse(await ipcRenderer.invoke(runtimeChannel)),
  getSnapshot: async () => snapshotSchema.parse(await ipcRenderer.invoke('goalloom:query', { type: 'snapshot' })),
  getItem: async itemId => detailSchema.parse(await ipcRenderer.invoke('goalloom:query', { type: 'item', itemId })),
  listItems: async query => itemPageSchema.parse(await ipcRenderer.invoke('goalloom:query', query)),
  getHistory: async query => historyPageSchema.parse(await ipcRenderer.invoke('goalloom:query', query)),
  getActivity: async query => activitySchema.parse(await ipcRenderer.invoke('goalloom:query', query)),
  execute: async command => replySchema.parse(await ipcRenderer.invoke('goalloom:command', command)),
  getReceipt: async (operationId, generation) => resultSchema.nullable().parse(await ipcRenderer.invoke('goalloom:query', { type: 'receipt', operationId, generation })),
  exportWorkspace: async () => Boolean(await ipcRenderer.invoke('goalloom:export')),
}
contextBridge.exposeInMainWorld('goalloom', Object.freeze(api))
