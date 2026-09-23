/**
 * [INPUT]: 有限 preload API、用户命令、纯 UndoSession。
 * [OUTPUT]: 权威快照、同 ID 故障重试、效果撤销栈与可访问反馈。
 * [POS]: renderer 状态入口；未知提交保留请求，不伪造失败或再次写入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandInput, CommandResult } from '../../shared/contracts/commands'
import type { Snapshot } from '../../shared/contracts/queries'
import { UndoSession } from './session'

type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'generation' | 'operationId'> : never
export type Action = WithoutEnvelope<CommandInput>
export interface Feedback { result: CommandResult; text: string }
export function desktopApi() {
  if (!window.goalloom) throw new Error('请在 Goalloom 桌面应用中打开，当前无法保存数据')
  return window.goalloom
}
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CommandInput | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const session = useRef(new UndoSession())
  const locked = useRef(false), current = useRef(snapshot)
  current.current = snapshot
  const refresh = useCallback(async () => {
    const next = await desktopApi().getSnapshot()
    if (session.current.reset(next.workspace.generation)) { setFeedback(null); setUndoCount(0); setPending(null) }
    current.current = next
    setSnapshot(next)
    return next
  }, [])
  useEffect(() => { void refresh().catch(error => setError(String(error))) }, [refresh])
  const accept = useCallback(async (result: CommandResult) => {
    await refresh()
    if (!session.current.accept(result)) return result
    setUndoCount(session.current.entries.length)
    if (result.outcome === 'conflict_skipped') { setError(`未撤销：${result.warnings.join('；')}。该快捷项已移出，下次撤销处理前一项。`); return result }
    if (result.warnings.length) setError(result.warnings.join('；'))
    const isUndo = result.originalOperationId !== null
    if (result.changed && (isUndo || (result.undoable && !['创建', '拆解下一步', '排序'].includes(result.label)))) {
      const detail = result.itemId ? await desktopApi().getItem(result.itemId).catch(() => null) : null
      setFeedback({ result, text: `${isUndo ? '已撤销：' : '已'}${result.label}${detail ? `「${detail.item.title}」` : ''}` })
    }
    return result
  }, [refresh])
  const perform = useCallback(async (command: CommandInput): Promise<CommandResult | null> => {
    if (locked.current) return null
    locked.current = true; setBusy(true); setError(null)
    try {
      const reply = await desktopApi().execute(command)
      setPending(null)
      if (!reply.ok) { setError(reply.message); await refresh(); return null }
      return await accept(reply.result)
    } catch {
      // --- 未知结果保留同一请求，后续先查回执；不会丢弃撤销栈项。 ---
      try {
        const receipt = await desktopApi().getReceipt(command.operationId, command.generation)
        if (receipt) { setPending(null); return await accept(receipt) }
      } catch { /* 存储恢复后用原操作 ID 重试。 */ }
      setPending(command); setError('尚未确认保存结果，请重试核对。为避免重复操作，暂时停止新写入。')
      return null
    } finally { locked.current = false; setBusy(false) }
  }, [refresh, accept])
  const submit = useCallback(async (action: Action) => {
    if (!current.current || pending) return null
    return perform({ ...action, operationId: crypto.randomUUID(), generation: current.current.workspace.generation } as CommandInput)
  }, [perform, pending])
  const undo = useCallback((operationId?: string) => {
    const id = operationId ?? session.current.entries.at(-1)?.operationId
    return id ? submit({ type: 'undo', originalOperationId: id }) : Promise.resolve(null)
  }, [submit])
  const retry = () => pending ? perform(pending) : Promise.resolve(null)
  return { snapshot, error, setError, busy: busy || pending !== null || !!snapshot?.maintenance, submit, refresh, feedback, setFeedback, undo, undoCount, pending, retry }
}
