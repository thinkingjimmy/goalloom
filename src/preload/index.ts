/**
 * [INPUT]: Electron 沙箱 contextBridge/ipcRenderer 和共享运行时 schema。
 * [OUTPUT]: 有限只读 window.goalloom；不暴露事件、通道参数或 Node API。
 * [POS]: renderer/main 间唯一桥接层，响应经 schema 复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { contextBridge, ipcRenderer } from 'electron'
import { runtimeChannel, runtimeInfoSchema, type GoalloomApi } from '../shared/contracts/runtime'

const api: GoalloomApi = {
  getRuntime: async () => runtimeInfoSchema.parse(await ipcRenderer.invoke(runtimeChannel)),
}
contextBridge.exposeInMainWorld('goalloom', Object.freeze(api))
