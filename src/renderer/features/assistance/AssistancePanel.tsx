/**
 * [INPUT]: Live Markdown editor, authoritative facts and the detail's guarded autosave writer.
 * [OUTPUT]: Inline obstacle choices and one automatically persisted note rewrite, with Rethink below the editor.
 * [POS]: Task assistance presentation; settings gate network access, the main process owns context and output validation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AssistancePrepared } from '../../../shared/contracts/assistance'
import type { ExecutionFacts } from '../../../shared/contracts/execution'
import { desktopApi } from '../../state/use-workspace'
import { insightSettings } from '../../state/insight'
import { readAssistanceDraft, saveAssistanceDraft } from '../../state/assistance-drafts'
import { useLocale } from '../../i18n'
import { noteAssistanceMessages } from '../../i18n/note-assistance'
import { assistanceMessages } from '../../i18n/assistance'
import { Icon } from '../../components/icons'
import './assistance.css'

export function AssistancePanel({ itemId, generation, revision, observedAt, active, initialOpen = false, assisted, locked, flush, captureRevision, rewrite, connect, children }: {
  itemId: string; generation: string; revision: number; observedAt: string; active: boolean; initialOpen?: boolean; assisted: boolean; locked: boolean
  flush: () => Promise<boolean>; captureRevision: () => number
  rewrite: (prepared: AssistancePrepared, description: string, revision: number, onCommit: () => void) => Promise<boolean>
  connect?: (() => void) | undefined; children: ReactNode
}) {
  const locale = useLocale(), t = noteAssistanceMessages()
  const [initial] = useState(() => readAssistanceDraft(generation, itemId))
  const [expanded, setExpanded] = useState(initialOpen), [selected, setSelected] = useState<number | null>(initial?.choice ?? null)
  const [text, setText] = useState(initial?.text ?? ''), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [hasResult, setHasResult] = useState(assisted)
  const [attempt, setAttempt] = useState(0)
  const [prepared, setPrepared] = useState<AssistancePrepared | null>(null), [facts, setFacts] = useState<ExecutionFacts | null>(null)
  const trigger = useRef<HTMLButtonElement>(null), options = useRef<HTMLDivElement>(null), custom = useRef<HTMLTextAreaElement>(null)
  const live = useRef(true), session = useRef<string | null>(null), epoch = useRef(0), working = useRef(false), composing = useRef(false)
  const callbacks = useRef({ flush, captureRevision, rewrite }); callbacks.current = { flush, captureRevision, rewrite }
  const draft = useRef({ selected, text }); draft.current = { selected, text }
  const activeRef = useRef(active); activeRef.current = active
  const stop = () => {
    epoch.current++; working.current = false
    if (session.current) void desktopApi().smart({ type: 'cancelAssistance', sessionId: session.current }).catch(() => {})
    session.current = null
  }
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false; stop()
      saveAssistanceDraft(generation, itemId, { choice: draft.current.selected, text: draft.current.text, answer: '', adjustment: '', guidance: null, manual: false, horizon: null, date: '', source: false })
    }
  }, [itemId, generation])
  useEffect(() => { setHasResult(assisted) }, [assisted])
  useEffect(() => {
    let current = true
    void desktopApi().getExecutionSummary({ type: 'executionSummary', itemId, generation }).then(value => { if (current) setFacts(value) }).catch(() => { if (current) setFacts(null) })
    return () => { current = false }
  }, [itemId, generation, revision, observedAt])
  const prepare = async (token: number) => {
    if (!await callbacks.current.flush() || !live.current || token !== epoch.current) return null
    const id = crypto.randomUUID(); session.current = id
    const reply = await desktopApi().smart({ type: 'prepareAssistance', request: { sessionId: id, itemId, generation, locale } })
    if (!live.current || token !== epoch.current || !activeRef.current) return null
    if (reply.type !== 'assistancePrepared') return null
    setPrepared(reply.prepared)
    return reply.prepared
  }
  useEffect(() => {
    if (!expanded || !active) return
    stop(); const token = epoch.current
    setLoading(true); setBusy(false); setError(''); setPrepared(null)
    void prepare(token).then(value => {
      if (live.current && token === epoch.current && !value) setError(t.failed)
    }).catch(() => { if (live.current && token === epoch.current) setError(t.failed) })
      .finally(() => { if (live.current && token === epoch.current) setLoading(false) })
    options.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return stop
  }, [expanded, active, itemId, generation, locale, attempt])
  const close = () => {
    if (locked) return
    stop(); setBusy(false); setLoading(false); setExpanded(false); setError('')
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }
  const generate = async () => {
    if (working.current || locked || composing.current || selected === null || selected === 3 && !text.trim()) return
    stop(); working.current = true
    const token = epoch.current
    setBusy(true); setError('')
    try {
      const value = await prepare(token)
      if (!live.current || token !== epoch.current) return
      if (!value?.enabled) { setError(t.unavailable); return }
      if (value.context.truncatedSections.includes('description')) { setError(t.tooLong); return }
      const editRevision = callbacks.current.captureRevision()
      const response = await desktopApi().smart({ type: 'assist', request: { mode: 'rewrite', requestId: crypto.randomUUID(),
        sessionId: value.sessionId, contextId: value.contextId, itemId, generation, locale, featureRevision: value.featureRevision,
        inputRevision: token, manualRevision: editRevision, turn: 1, prefs: insightSettings().prefs,
        text: selected === 3 ? text.trim() : t.choices[selected]!, answer: null, adjustment: null } })
      if (!live.current || token !== epoch.current || !activeRef.current) return
      if (response.type !== 'assistance') { setError(t.failed); return }
      const reply = response.reply
      if (reply.status !== 'ready') {
        if (reply.status === 'stale') setError(t.stale)
        if (reply.status === 'failed') setError(reply.failure.kind === 'too_large' ? t.tooLong : t.failed)
        return
      }
      if (reply.value.kind !== 'rewrite' || reply.echo.inputRevision !== token || reply.echo.manualRevision !== editRevision) { setError(t.failed); return }
      await callbacks.current.rewrite(value, reply.value.description, editRevision, () => {
        if (!live.current) return
        setHasResult(true); setBusy(false); setExpanded(false); setError('')
        requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
      })
    } catch { if (live.current && token === epoch.current) setError(t.failed) }
    finally { if (live.current && token === epoch.current) { working.current = false; setBusy(false) } }
  }
  const choose = (index: number) => { setSelected(index); if (index === 3) custom.current?.focus() }
  const count = facts?.carryovers.currentEpisode
  const carry = count?.quality === 'complete' ? count.value?.total ?? 0 : 0
  const showing = active && expanded
  return <section className={`rewrite-notes ${hasResult && !showing ? 'has-result' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape' && showing && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    {active && (!hasResult || showing) && <div className={`next-step-area ${showing ? 'is-expanded' : ''}`}>
      {showing ? <form className="assistance-panel" aria-label={t.question} aria-busy={busy || loading || locked} onSubmit={event => { event.preventDefault(); void generate() }}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}>
        <h3>{t.question}</h3>
        <div ref={options} className="help-options" onKeyDown={event => {
          if (event.target instanceof HTMLTextAreaElement || event.nativeEvent.isComposing || busy || locked) return
          const letter = 'abcd'.indexOf(event.key.toLowerCase())
          const next = letter >= 0 ? letter : event.key === 'ArrowDown' ? Math.min(3, (selected ?? -1) + 1) : event.key === 'ArrowUp' ? Math.max(0, (selected ?? 1) - 1) : -1
          if (next < 0) return
          event.preventDefault(); choose(next)
          if (next < 3) options.current?.querySelectorAll('button')[next]?.focus()
        }}>
          {t.choices.map((label, index) => <button key={index} type="button" className="help-option" aria-pressed={selected === index} disabled={busy || locked} onClick={() => choose(index)}>
            <span className="option-letter" aria-hidden="true">{'ABC'[index]}</span><span className="option-copy">{label}</span>{selected === index && <Icon name="check" size={16} />}
          </button>)}
          <label className={`help-option custom-option ${selected === 3 ? 'is-selected' : ''}`}><span className="option-letter" aria-hidden="true">D</span>
            <textarea ref={custom} aria-label={t.other} placeholder={t.other} rows={1} maxLength={2000} value={text} disabled={busy || locked} onFocus={() => setSelected(3)} onChange={event => { setText(event.target.value); setSelected(3) }} />
            {selected === 3 && <Icon name="check" size={16} />}
          </label>
        </div>
        {error && <p className="inline-error" role="alert">{error} {!prepared && !loading && <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>{assistanceMessages().retry}</button>}</p>}
        {!loading && prepared && !prepared.enabled && <p className="assistance-unavailable">{t.unavailable} {connect && <button type="button" className="text-button" onClick={connect}>{t.settings}</button>}</p>}
        <div className="assistance-actions">{busy || locked ? <><span role="status">{t.pending}</span><button type="button" className="button" disabled={locked} onClick={close}>{t.cancel}</button></> : <>
          <button type="button" className="text-button" onClick={close}>{t.later}</button><button type="submit" className="button primary" disabled={loading || !prepared?.enabled || selected === null || selected === 3 && !text.trim()}>{t.generate}<Icon name="forward" size={16} /></button>
        </>}</div>
      </form> : <button ref={trigger} type="button" className="action-invitation" aria-label={t.title} disabled={locked} onClick={() => setExpanded(true)}>
        <span className="invitation-symbol"><Icon name="smart" size={20} /></span><span className="action-invitation-copy">{carry > 0 && <span>{t.carried(carry)}</span>}<span>{t.invitation}</span></span><span className="action-invitation-cta">{t.title}<Icon name="forward" size={18} /></span>
      </button>}
    </div>}
    {children}
    {active && hasResult && !showing && <div className="rewrite-actions"><button ref={trigger} type="button" className="text-button help-link" disabled={locked} onClick={() => setExpanded(true)}><Icon name="smart" size={14} />{t.rethink}</button></div>}
  </section>
}
