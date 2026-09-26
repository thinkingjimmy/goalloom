/**
 * [INPUT]: Finite preload API, user commands, UndoSession and post-layout board visibility.
 * [OUTPUT]: Authoritative snapshots, visibility-aware success/undo feedback, deduplicated completion events after committed writes and a
 *           keyboard undo request that waits for an in-flight own write instead of being dropped.
 * [POS]: Renderer state boundary; preserves unknown receipts and avoids redundant own-write refreshes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages } from '../i18n'
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CommandInput, CommandResult } from '../../shared/contracts/commands'
import type { ItemHorizon } from '../../shared/contracts/entities'
import type { Snapshot } from '../../shared/contracts/queries'
import { shareSnapshot } from './snapshot'
import { UndoSession } from './session'
import { feedbackKind, resolveFeedback, systemFeedback, type Feedback, type FeedbackCandidate, type FeedbackItem, type ItemVisibility } from './feedback'

type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'generation' | 'operationId'> : never
export type Action = WithoutEnvelope<CommandInput>
export interface CompletionEvent { operationId: string; generation: string; horizon: ItemHorizon }
export function desktopApi() {
  if (!window.goalloom) throw new Error(messages.missingBridge)
  return window.goalloom
}
export function useWorkspace(itemVisibility: (item: FeedbackItem) => ItemVisibility) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CommandInput | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [candidate, setCandidate] = useState<FeedbackCandidate | null>(null)
  const [completion, setCompletion] = useState<CompletionEvent | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const session = useRef(new UndoSession())
  const locked = useRef(false), current = useRef(snapshot)
  const epoch = useRef(0), flight = useRef<{ epoch: number; promise: Promise<Snapshot> } | null>(null)
  const delayed = useRef<(CommandResult | null)[]>([])
  const deferredUndo = useRef(false), latestUndo = useRef<() => Promise<CommandResult | null>>(() => Promise.resolve(null))
  const refresh = useCallback((): Promise<Snapshot> => {
    if (flight.current) return flight.current.epoch === epoch.current ? flight.current.promise : flight.current.promise.then(refresh)
    const version = epoch.current
    const promise = desktopApi().getSnapshot().then(next => {
      if (version !== epoch.current) return next
      if (session.current.reset(next.workspace.generation)) { setFeedback(null); setCandidate(null); setCompletion(null); setUndoCount(0); setPending(null); deferredUndo.current = false }
      const key = (value: Snapshot) => {
        const { lastObservedAt: _observed, ...workspace } = value.workspace
        return JSON.stringify([workspace, value.periods, value.maintenance, value.backupError])
      }
      if (!current.current || key(current.current) !== key(next)) {
        const initial = current.current === null
        const shared = shareSnapshot(current.current, next)
        current.current = shared
        // Initial setup may load a local view chunk; keep the opening screen until it can render.
        if (initial) startTransition(() => setSnapshot(shared))
        else setSnapshot(shared)
      }
      return current.current
    }).finally(() => { if (flight.current?.promise === promise) flight.current = null })
    flight.current = { epoch: version, promise }
    return promise
  }, [])
  useEffect(() => { void refresh().catch(error => setError(String(error))) }, [refresh])
  useLayoutEffect(() => {
    if (!candidate || !snapshot || candidate.result.generation !== snapshot.workspace.generation || snapshot.workspace.revision < candidate.revision) return
    let visibility: ItemVisibility = 'outside-view'
    try { if (candidate.item) visibility = itemVisibility(candidate.item) } catch { /* Saved results do not depend on view measurement. */ }
    const next = resolveFeedback(candidate, snapshot, visibility)
    if (next) setFeedback(next)
    setCandidate(null)
  }, [candidate, snapshot, itemVisibility])
  useEffect(() => {
    if (!window.goalloom) return
    return desktopApi().onChanged(result => { if (locked.current) { delayed.current.push(result); return }; epoch.current++; void refresh().then(() => {
      if (result?.changed && session.current.accept(result)) setFeedback(systemFeedback(result))
    }).catch(() => setError(messages.refreshFailed)) })
  }, [refresh])
  const accept = useCallback(async (result: CommandResult, command: CommandInput) => {
    const next = await refresh()
    for (const notification of delayed.current.splice(0)) if (notification?.changed && session.current.accept(notification)) setFeedback(systemFeedback(notification))
    if (!session.current.accept(result)) return result
    setUndoCount(session.current.entries.length)
    if (result.outcome === 'conflict_skipped') { setError(messages.undoConflict(result.warnings.join(messages.sentenceJoin))); return result }
    const kind = feedbackKind(command, result)
    if (result.warnings.length && kind !== 'restore') setError(result.warnings.join(messages.sentenceJoin))
    const isUndo = result.originalOperationId !== null
    const completing = command.type === 'status' && command.status === 'done'
    if (completing && result.changed && !isUndo && result.itemId) {
      // Archived and past-period items are absent from the board snapshot, but can still be completed in detail.
      const item = next.items.find(item => item.id === result.itemId)
        ?? (await desktopApi().getItem(result.itemId).catch(() => null))?.item
      if (item && current.current?.workspace.generation === result.generation) {
        setCompletion({ operationId: result.operationId, generation: result.generation, horizon: item.placement.horizon })
      }
    }
    if (kind) {
      const item = next.items.find(item => item.id === result.itemId)
        ?? (result.itemId ? (await desktopApi().getItem(result.itemId).catch(() => null))?.item : null)
      if (current.current?.workspace.generation === result.generation) setCandidate({ result, kind, item: item ?? null, revision: next.workspace.revision })
    }
    return result
  }, [refresh])
  const perform = useCallback(async (command: CommandInput): Promise<CommandResult | null> => {
    if (locked.current) return null
    locked.current = true; epoch.current++; setBusy(true); setError(null); setErrorCode(null)
    try {
      const reply = await desktopApi().execute(command)
      setPending(null)
      if (!reply.ok) { setError(reply.message); setErrorCode(reply.code); await refresh(); return null }
      return await accept(reply.result, command)
    } catch {
      // --- 未知结果保留同一请求，后续先查回执；不会丢弃撤销栈项。 ---
      try {
        const receipt = await desktopApi().getReceipt(command.operationId, command.generation)
        if (receipt) { setPending(null); return await accept(receipt, command) }
      } catch { /* 存储恢复后用原操作 ID 重试。 */ }
      setPending(command); setError(messages.saveUnknown)
      return null
    } finally {
      locked.current = false; setBusy(false)
      if (deferredUndo.current) { deferredUndo.current = false; setTimeout(() => void latestUndo.current()) }
      if (delayed.current.length) { const notifications = delayed.current.splice(0); void refresh().then(() => { for (const result of notifications) if (result?.changed && session.current.accept(result)) setFeedback(systemFeedback(result)) }).catch(() => setError(messages.refreshFailed)) }
    }
  }, [refresh, accept])
  const submit = useCallback(async (action: Action) => {
    if (!current.current || pending) return null
    return perform({ ...action, operationId: crypto.randomUUID(), generation: current.current.workspace.generation } as CommandInput)
  }, [perform, pending])
  const undo = useCallback((operationId?: string) => {
    const id = operationId ?? session.current.entries.at(-1)?.operationId
    return id ? submit({ type: 'undo', originalOperationId: id }) : Promise.resolve(null)
  }, [submit])
  latestUndo.current = undo
  // A keyboard undo pressed while an own write is still settling targets that write, so it runs (once) when it lands.
  const requestUndo = useCallback(() => {
    if (locked.current) deferredUndo.current = true
    else void undo()
  }, [undo])
  const retry = () => pending ? perform(pending) : Promise.resolve(null)
  return { snapshot, error, errorCode, setError, busy: busy || pending !== null || !!snapshot?.maintenance, submit, refresh, feedback, setFeedback, completion, undo, requestUndo, undoCount, pending, retry }
}
