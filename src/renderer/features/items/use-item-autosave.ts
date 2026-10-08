/**
 * [INPUT]: Item identity/generation, authoritative revisions and the reserved workspace writer.
 * [OUTPUT]: Source-preserving drafts, guarded atomic note rewrites, serialized autosave/actions, empty-title dismissal and receipt-first retry.
 * [POS]: Detail persistence boundary; explicit dismissal can discard, while navigation/native close only drain edits.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Item } from '../../../shared/contracts/entities'
import type { ItemDetail } from '../../../shared/contracts/queries'
import type { CommandResult } from '../../../shared/contracts/commands'
import { desktopApi, type Action, type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import { messages } from '../../i18n'
import { canDiscardEmptyTitle } from '../../../domain/items'
import type { AssistancePrepared } from '../../../shared/contracts/assistance'
import { noteAssistanceMessages } from '../../i18n/note-assistance'

const draftOf = (item: Item) => ({ title: item.title, description: item.description, dueDate: item.dueDate ?? '' })
type Draft = ReturnType<typeof draftOf>
const fields = ['title', 'description', 'dueDate'] as const
const valueOf = (draft: Draft, field: keyof Draft) => field === 'title' ? draft.title.trim() : draft[field]
const differs = (a: Draft, b: Draft) => fields.some(field => valueOf(a, field) !== valueOf(b, field))
const problem = (draft: Draft) => !draft.title.trim() ? messages.titleRequired : draft.description.length > 100_000 ? messages.descriptionTooLong : ''

export function useItemAutosave({ itemId, generation, revision, write, retryWrite }: {
  itemId: string; generation: string; revision: number; write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [draft, setDraft] = useState<Draft>({ title: '', description: '', dueDate: '' })
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [actionBusy, setActionBusy] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const editRevision = useRef(0), rewriteLock = useRef(false)
  const discardLock = useRef(false), discardAttempt = useRef(false)
  const live = useRef(true), current = useRef<ItemDetail | null>(null)
  const source = useRef(draft), baseline = useRef(draft), composing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flight = useRef<Promise<boolean> | null>(null), uncertain = useRef<{ draft: Draft | null; onCommit?: () => void } | null>(null)
  const actions = useRef(Promise.resolve()), queued = useRef(0)
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
  const cancelTimer = () => { clearTimeout(timer.current); timer.current = undefined }
  const dirty = () => !!current.current && differs(source.current, baseline.current)
  const publish = (next: Draft) => { source.current = next; if (live.current) setDraft(next) }
  const receive = useCallback((next: ItemDetail, merge: boolean) => {
    if (!live.current || current.current && next.item.version < current.current.item.version) return
    if (!current.current) { baseline.current = draftOf(next.item); publish(baseline.current) }
    else if (merge) {
      const saved = draftOf(next.item), nextDraft = { ...source.current }
      for (const field of fields) {
        // Preserve raw title whitespace while editing, and merge only fields the user has not changed.
        if (valueOf(source.current, field) === valueOf(baseline.current, field) && valueOf(source.current, field) !== saved[field]) nextDraft[field] = saved[field]
      }
      baseline.current = saved; publish(nextDraft)
    }
    current.current = next; setDetail(next)
  }, [])
  useEffect(() => {
    live.current = true
    return () => { live.current = false; cancelTimer() }
  }, [])
  useEffect(() => {
    let active = true
    void desktopApi().getItem(itemId).then(next => { if (active) receive(next, !flight.current && !uncertain.current) })
      .catch(() => { if (active) setError(messages.itemFailed) })
    return () => { active = false }
  }, [itemId, revision, receive])

  const flush = useCallback((): Promise<boolean> => {
    cancelTimer()
    if (flight.current) return flight.current
    if (!live.current || !current.current) return Promise.resolve(true)
    if (composing.current || uncertain.current) return Promise.resolve(false)
    if (!dirty()) return Promise.resolve(true)
    const invalid = problem(source.current)
    if (invalid) { setError(invalid); return Promise.resolve(false) }
    setSaving(true); setError('')
    const drain = async () => {
      while (live.current && dirty()) {
        if (composing.current) return false
        let submitted: Draft | null = null, invalid = ''
        const reply = await write(async () => {
          if (!live.current || composing.current) return null
          const latest = await desktopApi().getItem(itemId)
          if (!live.current) return null
          receive(latest, true)
          invalid = problem(source.current)
          if (invalid || !dirty()) return null
          submitted = { ...source.current, title: source.current.title.trim() }
          return { type: 'edit', itemId, expectedVersion: latest.item.version, ...submitted, dueDate: submitted.dueDate || null }
        }, generation)
        if (!live.current) return false
        if (invalid) { setError(invalid); return false }
        if (!reply.ok) {
          if (reply.pending) uncertain.current = { draft: submitted }
          setError(reply.message); return false
        }
        if (submitted) baseline.current = submitted
        publish({ ...source.current })
        if (reply.result) {
          try { receive(await desktopApi().getItem(itemId), true) }
          catch { setError(messages.itemFailed); return false }
        }
        if (!submitted) return !dirty()
      }
      return true
    }
    const promise = drain().finally(() => { flight.current = null; if (live.current) setSaving(false) })
    flight.current = promise
    return promise
  }, [generation, itemId, receive, write])
  flushRef.current = flush
  const change = (field: keyof Draft, value: string, immediate = false) => {
    if (discardLock.current || rewriteLock.current || current.current?.item.deletedAt || source.current[field] === value) return
    editRevision.current++
    discardAttempt.current = false
    publish({ ...source.current, [field]: value })
    cancelTimer()
    if (uncertain.current) return
    setError('')
    if (!composing.current) timer.current = setTimeout(() => { void flushRef.current() }, immediate ? 0 : 500)
  }
  const composition = (active: boolean) => {
    if (active) editRevision.current++
    composing.current = active; cancelTimer()
    if (!active) timer.current = setTimeout(() => { void flushRef.current() }, 500)
  }
  const retry = async (): Promise<boolean> => {
    if (uncertain.current) {
      const { draft: submitted, onCommit } = uncertain.current
      setSaving(true)
      const reply = await retryWrite(generation)
      if (!live.current) return false
      setSaving(false)
      if (!reply.ok) {
        if (!reply.pending) { uncertain.current = null; discardLock.current = false; setDiscarding(false); rewriteLock.current = false; setRewriting(false) }
        setError(reply.message); return false
      }
      uncertain.current = null; if (submitted && reply.result) baseline.current = submitted; setError(''); publish({ ...source.current })
      if (discardAttempt.current && reply.result) return true
      try { receive(await desktopApi().getItem(itemId), true) } catch { setError(messages.itemFailed); return false }
      finally { rewriteLock.current = false; setRewriting(false) }
      if (reply.result) onCommit?.()
    }
    if (discardAttempt.current) return dismiss()
    await flush()
    return false
  }
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    queued.current++; setActionBusy(true)
    const run = actions.current.then(operation).finally(() => { queued.current--; if (live.current) setActionBusy(queued.current > 0) })
    actions.current = run.then(() => undefined, () => undefined)
    return run
  }
  const rewrite = (prepared: AssistancePrepared, description: string, expectedRevision: number, onCommit: () => void): Promise<boolean> => enqueue(async () => {
    const unchanged = () => live.current && !composing.current && !uncertain.current && editRevision.current === expectedRevision && !dirty()
    if (!unchanged()) { setError(noteAssistanceMessages().stale); return false }
    rewriteLock.current = true; setRewriting(true); setError('')
    const reply = await write(async () => {
      if (!unchanged()) return null
      const latest = await desktopApi().getItem(itemId)
      if (!unchanged() || latest.item.version !== prepared.context.item.version) return null
      return { type: 'applyAssistance', itemId, expectedVersion: latest.item.version, expectedGuidanceRevision: prepared.context.guard.guidanceRevision,
        guidance: { kind: 'keep' }, description, guard: prepared.context.guard, contextId: prepared.contextId }
    }, generation)
    if (!reply.ok && reply.pending) uncertain.current = { draft: null, onCommit }
    else if (!reply.ok || !reply.result) { rewriteLock.current = false; if (live.current) setRewriting(false) }
    if (!live.current) return false
    if (!reply.ok) { setError(reply.message); return false }
    if (!reply.result) { setError(noteAssistanceMessages().stale); return false }
    try {
      receive(await desktopApi().getItem(itemId), true)
      onCommit()
      return true
    } finally { rewriteLock.current = false; if (live.current) setRewriting(false) }
  })
  const submit = (action: Action): Promise<CommandResult | null> => enqueue(async () => {
    if (!live.current || !await flush()) return null
    const reply = await write(async () => {
      if (!live.current) return null
      const latest = await desktopApi().getItem(itemId)
      if (!live.current) return null
      receive(latest, true)
      // Only this detail's item version changes when its pending text is saved. Other dependency guards stay intact.
      if ('itemId' in action && action.itemId === itemId && 'expectedVersion' in action) return { ...action, expectedVersion: latest.item.version }
      if (action.type === 'link') return { ...action, ...(action.parentId === itemId ? { expectedParentVersion: latest.item.version } : { expectedChildVersion: latest.item.version }) }
      if (action.type === 'unlink') {
        const edge = latest.relations.find(edge => edge.id === action.relationId)
        if (edge) return { ...action, ...(edge.parentId === itemId ? { expectedParentVersion: latest.item.version } : { expectedChildVersion: latest.item.version }) }
      }
      return action
    }, generation)
    if (!reply.ok) { if (reply.pending) uncertain.current = { draft: null }; if (live.current) setError(reply.message); return null }
    return reply.result
  })
  const discardable = (latest: ItemDetail) => !source.current.title.trim()
    && canDiscardEmptyTitle(latest.item, latest.relations.length, !!latest.guidance?.value)
    && !source.current.description.trim() && !source.current.dueDate
  const dismiss = (): Promise<boolean> => enqueue(async () => {
    cancelTimer()
    if (flight.current) await flight.current
    if (!live.current || composing.current || uncertain.current) return false
    if (!current.current || !discardable(current.current)) return flush()
    const reply = await write(async () => {
      if (!live.current || composing.current) return null
      const latest = await desktopApi().getItem(itemId)
      if (!live.current || composing.current) return null
      receive(latest, true)
      if (!discardable(latest)) return null
      // The submitted close owns this draft until its receipt is known; it cannot absorb later typing.
      cancelTimer(); discardAttempt.current = true; discardLock.current = true; setDiscarding(true); setError('')
      return { type: 'discardEmpty', itemId, expectedVersion: latest.item.version }
    }, generation)
    if (!live.current) return false
    if (!reply.ok) {
      if (reply.pending) uncertain.current = { draft: null }
      else { discardLock.current = false; setDiscarding(false) }
      setError(reply.message); return false
    }
    return reply.result !== null || await flush()
  })
  const drain = async () => { await actions.current; return flush() }
  useEffect(() => desktopApi().onBeforeClose(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    await Promise.resolve()
    return drain()
  }), [flush])
  return { detail, draft, error, setError, saving, actionBusy, discarding, rewriting, rewrite, captureRevision: () => editRevision.current, change, composition, flush: drain, dismiss, retry, submit, dirty: dirty() }
}
