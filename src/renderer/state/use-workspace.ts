/**
 * [INPUT]: Finite preload API, user commands and UndoSession.
 * [OUTPUT]: Single-flight authoritative refresh, stable snapshot sharing, typed errors and scoped feedback.
 * [POS]: Renderer state boundary; preserves unknown receipts and avoids redundant own-write refreshes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages } from '../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandInput, CommandResult } from '../../shared/contracts/commands'
import type { Snapshot } from '../../shared/contracts/queries'
import { shareSnapshot } from './snapshot'
import { UndoSession } from './session'

type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'generation' | 'operationId'> : never
export type Action = WithoutEnvelope<CommandInput>
export interface Feedback { result: CommandResult; text: string }
export function desktopApi() {
  if (!window.goalloom) throw new Error(messages.missingBridge)
  return window.goalloom
}
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CommandInput | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const session = useRef(new UndoSession())
  const locked = useRef(false), current = useRef(snapshot)
  const feedbackPolicy = useRef<{ operationId: string; quiet: boolean } | null>(null)
  current.current = snapshot
  const epoch = useRef(0), flight = useRef<{ epoch: number; promise: Promise<Snapshot> } | null>(null)
  const delayed = useRef<(CommandResult | null)[]>([])
  const refresh = useCallback((): Promise<Snapshot> => {
    if (flight.current) return flight.current.epoch === epoch.current ? flight.current.promise : flight.current.promise.then(refresh)
    const version = epoch.current
    const promise = desktopApi().getSnapshot().then(next => {
      if (version !== epoch.current) return next
      if (session.current.reset(next.workspace.generation)) { setFeedback(null); setUndoCount(0); setPending(null) }
      const key = (value: Snapshot) => {
        const { lastObservedAt: _observed, ...workspace } = value.workspace
        return JSON.stringify([workspace, value.periods, value.maintenance, value.backupError])
      }
      if (!current.current || key(current.current) !== key(next)) { current.current = shareSnapshot(current.current, next); setSnapshot(current.current) }
      return current.current
    }).finally(() => { if (flight.current?.promise === promise) flight.current = null })
    flight.current = { epoch: version, promise }
    return promise
  }, [])
  useEffect(() => { void refresh().catch(error => setError(String(error))) }, [refresh])
  useEffect(() => {
    if (!window.goalloom) return
    return desktopApi().onChanged(result => { if (locked.current) { delayed.current.push(result); return }; epoch.current++; void refresh().then(() => {
      if (result?.changed && session.current.accept(result)) setFeedback({ result, text: result.label })
    }).catch(() => setError(messages.refreshFailed)) })
  }, [refresh])
  const accept = useCallback(async (result: CommandResult, quiet: boolean) => {
    await refresh()
    for (const notification of delayed.current.splice(0)) if (notification?.changed && session.current.accept(notification)) setFeedback({ result: notification, text: notification.label })
    if (!session.current.accept(result)) return result
    setUndoCount(session.current.entries.length)
    if (result.outcome === 'conflict_skipped') { setError(messages.undoConflict(result.warnings.join(messages.sentenceJoin))); return result }
    if (result.warnings.length) setError(result.warnings.join(messages.sentenceJoin))
    const isUndo = result.originalOperationId !== null
    if (result.changed && (isUndo || (result.undoable && !quiet))) {
      const detail = result.itemId ? await desktopApi().getItem(result.itemId).catch(() => null) : null
      setFeedback({ result, text: (isUndo ? messages.undone : messages.applied)(result.label, detail?.item.title ?? null) })
    }
    return result
  }, [refresh])
  const perform = useCallback(async (command: CommandInput): Promise<CommandResult | null> => {
    if (locked.current) return null
    locked.current = true; epoch.current++; setBusy(true); setError(null); setErrorCode(null)
    if (feedbackPolicy.current?.operationId !== command.operationId) {
      const placement = command.type === 'move' ? current.current?.items.find(item => item.id === command.itemId)?.placement : null
      const period = command.type === 'move' ? current.current?.periods.find(period => period.horizon === command.horizon)?.id ?? null : null
      feedbackPolicy.current = { operationId: command.operationId, quiet: command.type === 'create' || (command.type === 'move' && placement?.horizon === command.horizon && placement.periodId === period) }
    }
    const quiet = feedbackPolicy.current.quiet
    try {
      const reply = await desktopApi().execute(command)
      setPending(null)
      if (!reply.ok) { setError(reply.message); setErrorCode(reply.code); await refresh(); return null }
      return await accept(reply.result, quiet)
    } catch {
      // --- 未知结果保留同一请求，后续先查回执；不会丢弃撤销栈项。 ---
      try {
        const receipt = await desktopApi().getReceipt(command.operationId, command.generation)
        if (receipt) { setPending(null); return await accept(receipt, quiet) }
      } catch { /* 存储恢复后用原操作 ID 重试。 */ }
      setPending(command); setError(messages.saveUnknown)
      return null
    } finally { locked.current = false; setBusy(false); if (delayed.current.length) { const notifications = delayed.current.splice(0); void refresh().then(() => { for (const result of notifications) if (result?.changed && session.current.accept(result)) setFeedback({ result, text: result.label }) }).catch(() => setError(messages.refreshFailed)) } }
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
  return { snapshot, error, errorCode, setError, busy: busy || pending !== null || !!snapshot?.maintenance, submit, refresh, feedback, setFeedback, undo, undoCount, pending, retry }
}
