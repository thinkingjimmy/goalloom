/**
 * [INPUT]: 权威已提交回执，当前工作区代次。
 * [OUTPUT]: 本会话撤销成员与反馈去重；无持久化业务状态。
 * [POS]: renderer 的纯会话库，快捷键/Toast 共用同一成员集合。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CommandResult } from '../../shared/contracts/commands'
export class UndoSession {
  generation = ''
  entries: CommandResult[] = []
  private seen = new Set<string>()
  reset(generation: string): boolean {
    if (generation === this.generation) return false
    this.generation = generation; this.entries = []; this.seen.clear()
    return true
  }
  accept(result: CommandResult): boolean {
    if (result.generation !== this.generation || this.seen.has(result.operationId)) return false
    this.seen.add(result.operationId)
    if (result.originalOperationId) this.entries = this.entries.filter(entry => entry.operationId !== result.originalOperationId)
    if (result.changed && result.undoable) this.entries.push(result)
    return true
  }
}
export function editingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input,textarea,[contenteditable="true"],[contenteditable=""]')
}
