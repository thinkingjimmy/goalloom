/**
 * [INPUT]: Saved task identity, explicit entry intent, prepared writer/receipt recovery and a local authoritative preflight.
 * [OUTPUT]: Bounded explicit generation, editable/manual guidance, exact movement preview and atomic adoption.
 * [POS]: Detail subview; preserves the mounted task editor and owns no separate modal or undo stack.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AssistanceOutput, AssistancePrepared } from '../../../shared/contracts/assistance'
import type { ExecutionFacts } from '../../../shared/contracts/execution'
import type { CalendarConfig, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { currentPeriod, parseDate } from '../../../domain/calendar'
import { horizons } from '../../../shared/contracts/values'
import { desktopApi, type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import { insightSettings } from '../../state/insight'
import { clearAssistanceDrafts, readAssistanceDraft, saveAssistanceDraft, type AssistanceDraft } from '../../state/assistance-drafts'
import { currentLocale, horizonNames, messages, providerNames, insightMessages, useLocale } from '../../i18n'
import { assistanceMessages } from '../../i18n/assistance'
import { periodDates } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { blankGuidance, GuidanceEditor } from './GuidanceEditor'
import './assistance.css'

export function AssistancePanel({ itemId, generation, write, retryWrite, close, calendar, onGuardChange, factsReady, active, decompose, connect, rescheduling = false, editing = false }: {
  itemId: string; generation: string; write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; close: () => void; calendar: CalendarConfig; onGuardChange: (locked: boolean) => void; factsReady: (facts: ExecutionFacts) => void; active: boolean; decompose?: (() => void) | undefined; connect?: (() => void) | undefined; editing?: boolean; rescheduling?: boolean
}) {
  const locale = useLocale(), t = assistanceMessages()
  const intent = rescheduling ? 'schedule' : editing ? 'guidance' : 'help'
  const title = rescheduling ? t.move : editing ? t.edit : t.title
  const [initial] = useState(() => readAssistanceDraft(generation, itemId, intent))
  const [prepared, setPrepared] = useState<AssistancePrepared | null>(null)
  const [draft, setDraft] = useState<AssistanceDraft>(() => ({ ...(initial ?? { text: '', answer: '', adjustment: '', guidance: null, manual: false, horizon: null, date: '', source: false }),
    ...(editing || rescheduling ? { manual: true, source: false } : {}), ...(rescheduling ? { guidance: null } : {}) }))
  const [output, setOutput] = useState<AssistanceOutput | null>(null), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false), [saving, setSaving] = useState(false), [pending, setPending] = useState(false)
  const [consent, setConsent] = useState(false), [laterConfirmed, setLaterConfirmed] = useState(false), [turns, setTurns] = useState(0)
  const session = useRef(crypto.randomUUID()), sequence = useRef(0), manualRevision = useRef(0), inputRevision = useRef(0), working = useRef(false), composing = useRef(false), retained = useRef(draft), mounted = useRef(true)
  const form = useRef<HTMLElement>(null), writing = useRef(false), focused = useRef(false)
  retained.current = draft
  useLayoutEffect(() => {
    if (loading || focused.current) return
    form.current?.querySelector<HTMLElement>(rescheduling ? 'select' : 'textarea')?.focus()
    focused.current = true
  }, [loading, rescheduling])
  const prepare = async (manual = false) => {
    const attempt = ++sequence.current
    setLoading(true); setError('')
    try {
      const reply = await desktopApi().smart({ type: 'prepareAssistance', request: { sessionId: session.current, itemId, generation, locale: currentLocale() } })
      if (!mounted.current || attempt !== sequence.current || reply.type !== 'assistancePrepared') return
      setPrepared(reply.prepared); factsReady(reply.prepared.context.facts); setConsent(reply.prepared.consented); setTurns(0); setOutput(null)
      setDraft(previous => ({ ...previous, ...(manual || editing || rescheduling ? { manual: true, source: false } : {}),
        horizon: previous.horizon ?? (rescheduling ? reply.prepared.context.item.placement.horizon : null),
        guidance: rescheduling ? null : previous.guidance ?? ((editing || manual) ? reply.prepared.context.guidance?.value ?? blankGuidance() : null),
        date: previous.date || (rescheduling ? reply.prepared.context.period?.startDate : null) || reply.prepared.context.guard.today,
      }))
    } catch { if (mounted.current && attempt === sequence.current) setError(t.failed) }
    finally { if (mounted.current && attempt === sequence.current) setLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void prepare(!!initial?.source)
    return () => {
      mounted.current = false; sequence.current++
      void desktopApi().smart({ type: 'cancelAssistance', sessionId: session.current }).catch(() => undefined)
      const value = retained.current
      saveAssistanceDraft(generation, itemId, value.text || value.guidance?.nextAction || value.answer || value.horizon ? value : null, intent)
    }
  }, [itemId, generation, locale])
  const change = (patch: Partial<AssistanceDraft>, manual = false) => {
    if (manual) manualRevision.current++; else inputRevision.current++
    setDraft(previous => ({ ...previous, ...patch }))
  }
  const cancel = () => {
    sequence.current++; working.current = false; setGenerating(false)
    void desktopApi().smart({ type: 'cancelAssistance', sessionId: session.current }).catch(() => undefined)
    setPrepared(null)
    void prepare(!!retained.current.guidance)
  }
  const generate = async (idea = false) => {
    if (!active || working.current || saving || composing.current || turns >= 3) return
    if (!prepared) { await prepare(); return }
    if (!prepared.enabled || !prepared.provider) { setError(t.unavailable); return }
    if (!consent) { setError(t.consentBody); return }
    working.current = true; setGenerating(true); setError('')
    const attempt = ++sequence.current, input = inputRevision.current, manual = manualRevision.current
    try {
      if (!prepared.consented) await desktopApi().smart({ type: 'consentAssistance', generation, provider: prepared.provider, consentVersion: 1, consent: true })
      const request = { requestId: crypto.randomUUID(), sessionId: session.current, itemId, generation, inputRevision: input, manualRevision: manual,
        featureRevision: prepared.featureRevision, contextId: prepared.contextId, locale: currentLocale(), turn: turns + 1,
        prefs: insightSettings().prefs, text: idea ? '' : draft.text, answer: output?.kind === 'clarify' ? draft.answer : null, adjustment: output?.kind === 'proposal' ? draft.adjustment : null }
      setTurns(request.turn)
      const reply = await desktopApi().smart({ type: 'assist', request })
      if (!mounted.current || attempt !== sequence.current || input !== inputRevision.current || manual !== manualRevision.current || reply.type !== 'assistance') return
      const result = reply.reply
      if (result.status === 'ready' && result.echo.requestId === request.requestId) {
        setOutput(result.value)
        if (result.value.kind === 'proposal') {
          const proposal = result.value
          setDraft(previous => ({ ...previous, manual: false, source: true, guidance: proposal.guidance ? { ...proposal.guidance, authorship: 'ai_assisted' } : null,
            horizon: proposal.moveSuggestion?.horizon ?? null, date: proposal.moveSuggestion?.localDate ?? previous.date }))
          setLaterConfirmed(false)
        }
      } else if (result.status === 'failed') setError(result.failure.message)
      else if (result.status === 'stale') setError(t.stale)
    } catch { if (mounted.current && attempt === sequence.current) setError(messages.activityFailed) }
    finally { if (mounted.current && attempt === sequence.current) { working.current = false; setGenerating(false) } }
  }
  let target: PlanningPeriod | null = null, targetError = false
  useEffect(() => { onGuardChange(saving || pending); return () => onGuardChange(false) }, [saving, pending, onGuardChange])
  if (calendar && draft.horizon && draft.horizon !== 'later') {
    try { target = currentPeriod(calendar, draft.horizon as Exclude<ItemHorizon, 'later'>, parseDate(draft.date).toZonedDateTime(calendar.timezone).toInstant().toString()) }
    catch { targetError = true }
    if (target && Date.parse(target.endAt) <= Date.parse(prepared?.context.facts.asOf ?? '')) targetError = true
  }
  const parents = prepared?.context.guard.parentRelationCount ?? 0
  const eligible = active && prepared?.context.item.status === 'todo' && !prepared.context.item.archivedAt && !prepared.context.item.deletedAt
  const canSave = (!draft.guidance || !!draft.guidance.nextAction.trim()) && !!prepared && !!eligible && (!!draft.guidance?.nextAction.trim() || !!draft.horizon) && !targetError
    && (!draft.horizon || draft.horizon !== 'later' || laterConfirmed) && !generating && !loading && !saving
  const finish = (result: WriteResult) => {
    if (!result.ok) { writing.current = result.pending; onGuardChange(result.pending); setError(result.message); setPending(result.pending); return }
    writing.current = false; onGuardChange(false)
    retained.current = { text: '', answer: '', adjustment: '', guidance: null, manual: false, horizon: null, date: '', source: false }
    clearAssistanceDrafts(itemId); close()
  }
  const save = async () => {
    if (!canSave || !prepared || composing.current || working.current) return
    working.current = true; writing.current = true; onGuardChange(true); setSaving(true); setError('')
    const preview = target
    const result = await write(async () => {
      const latest = await desktopApi().getItem(itemId)
      return { type: 'applyAssistance', itemId, expectedVersion: latest.item.version, expectedGuidanceRevision: latest.guidance?.revision ?? 0,
        guidance: draft.guidance ? { kind: 'set', value: { ...draft.guidance, nextAction: draft.guidance.nextAction.trim(), contextNote: draft.guidance.contextNote?.trim() || null, scopeNote: draft.guidance.scopeNote?.trim() || null, authorship: draft.source ? 'ai_assisted' : 'user' } } : { kind: 'keep' },
        ...(draft.source ? { guard: prepared.context.guard, contextId: prepared.contextId } : {}),
        ...(draft.horizon ? { move: { horizon: draft.horizon as ItemHorizon, startDate: preview?.startDate ?? null, previewPeriodId: preview?.id ?? null,
          expectedPlacementVersion: latest.item.placement.version, confirmedLater: laterConfirmed } } : {}),
      }
    }, generation)
    if (mounted.current) { working.current = false; setSaving(false); finish(result) }
  }
  const dismiss = () => { if (!saving && !pending) close() }
  useEffect(() => desktopApi().onBeforeClose(async () => !writing.current), [])
  return <section ref={form} className="assistance-panel" aria-label={title} aria-busy={loading || generating || saving}
    onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}>
    <header className="assistance-header"><button type="button" className="text-button" disabled={saving || pending} onClick={dismiss}><Icon name="previous" size={14} />{t.back}</button><h2>{title}</h2></header>
    {loading && <p role="status">{t.loading}</p>}
    {prepared && <p className="assistance-task">{prepared.context.item.title}</p>}
    {(draft.text || draft.answer || draft.adjustment || draft.guidance?.nextAction || draft.horizon) && <p className="assistance-note">{t.sessionOnly}</p>}
    {initial?.source && <p className="assistance-note">{t.draftSource}</p>}
    {prepared?.context.truncatedSections.length ? <p className="assistance-note">{t.truncated}</p> : null}
    {error && <p className="inline-error" role="alert">{error} {pending ? <button type="button" className="text-button" onClick={() => void retryWrite(generation).then(finish)}>{t.retry}</button>
      : <button type="button" className="text-button" onClick={() => void prepare(true)}>{t.refresh}</button>}</p>}
    {!draft.manual && <>
      <label>{t.difficulty}<textarea aria-label={t.difficulty} rows={3} maxLength={2000} value={draft.text} onChange={event => change({ text: event.target.value })} disabled={!active || saving || pending} /></label>
      <div className="assistance-shortcuts">{[t.kinds.resume_point, t.kinds.waiting_note, t.kinds.working_scope].map(value => <button type="button" className="text-button" key={value} onClick={() => change({ text: value })}>{value}</button>)}</div>
      {prepared?.provider && prepared.enabled && !prepared.consented && <div className="assistance-consent"><p>{providerNames[prepared.provider]} · {t.consentBody}</p>
        <label className="assistance-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t.consent}</label></div>}
      {output?.kind === 'clarify' && <label>{output.question}<textarea rows={2} aria-label={t.answer} maxLength={2000} value={draft.answer} onChange={event => change({ answer: event.target.value })} /></label>}
      {output?.kind === 'proposal' && <><p>{output.explanation}</p><label>{t.adjustment}<textarea aria-label={t.adjustment} rows={2} maxLength={2000} value={draft.adjustment} onChange={event => change({ adjustment: event.target.value })} /></label></>}
      <div className="assistance-generation-actions">{generating ? <button type="button" className="button secondary" onClick={cancel}>{t.cancel}</button>
        : <button type="button" className="button" disabled={!active || loading || saving || pending || turns >= 3 } onClick={() => void generate()}>{output?.kind === 'proposal' ? t.adjust : t.generate}</button>}
        {!output && <button type="button" className="text-button" disabled={!active || generating || loading || saving || turns >= 3} onClick={() => void generate(true)}>{t.idea}</button>}
      </div>
      {turns >= 3 && <p className="assistance-note">{t.limit} <button type="button" className="text-button" onClick={() => void prepare()}>{t.newSession}</button></p>}
      {!prepared?.enabled && !loading && <p className="assistance-note">{t.unavailable}{error && connect && <button type="button" className="text-button" onClick={connect}>{messages.settings}</button>}</p>}
      <button type="button" className="text-button" disabled={!active || saving || pending} onClick={() => { manualRevision.current++; setDraft(previous => ({ ...previous, manual: true, source: false, guidance: previous.guidance ?? prepared?.context.guidance?.value ?? blankGuidance() })) }}>{t.manual}</button>
    </>}
    {!rescheduling && decompose && active && prepared && !['later', 'day'].includes(prepared.context.item.placement.horizon) && <button type="button" className="text-button" disabled={saving || pending} onClick={() => { if (!composing.current) decompose() }}>{insightMessages.menuDecompose}</button>}
    {draft.guidance && <section aria-label={t.proposal}><h3>{t.guidance}</h3><GuidanceEditor value={draft.guidance} disabled={!active || saving || pending} change={guidance => change({ guidance }, true)} /></section>}
    {(draft.manual || output?.kind === 'proposal') && <section className="assistance-preview" aria-label={t.changes}>
      <h3>{t.changes}</h3><p className="assistance-note">{t.unchanged}</p>
      <label className="assistance-check"><input type="checkbox" checked={!!draft.horizon} disabled={!active || saving || pending} onChange={event => { setLaterConfirmed(false); change({ horizon: event.target.checked ? prepared?.context.item.placement.horizon ?? 'day' : null }, true) }} />{t.chooseMove}</label>
      {draft.horizon && <>
        <label>{t.destination}<select value={draft.horizon} disabled={!active || saving || pending} onChange={event => { setLaterConfirmed(false); change({ horizon: event.target.value }, true) }}>{horizons.map(horizon => <option key={horizon} value={horizon}>{horizonNames[horizon]}</option>)}</select></label>
        {draft.horizon !== 'later' && <label>{t.date}<input type="date" value={draft.date} disabled={!active || saving || pending} onChange={event => change({ date: event.target.value }, true)} /></label>}
        {targetError && <p className="inline-error" role="alert">{t.invalidTarget}</p>}
        {target && <p className="assistance-destination">{horizonNames[target.horizon]} · {periodDates(target)}</p>}
        {target && prepared?.context.item.dueDate && target.startDate > prepared.context.item.dueDate && <p className="inline-error">{t.deadlineConflict}</p>}
        {draft.horizon === 'later' && <><p>{t.laterImpact(parents)}</p><p className="assistance-note">{prepared?.context.parents.map(parent => parent.title).join(messages.listJoin)}{parents > (prepared?.context.parents.length ?? 0) && ` · ${t.truncated}`}</p><label className="assistance-check"><input type="checkbox" checked={laterConfirmed} onChange={event => setLaterConfirmed(event.target.checked)} />{t.confirmLater}</label></>}
      </>}
      <button type="button" className="button" disabled={!canSave || pending} onClick={() => void save()}>{draft.horizon ? t.apply : t.save}</button>
      {draft.source && <button type="button" className="text-button" onClick={() => { manualRevision.current++; change({ source: false, manual: true }, true) }}>{t.manualDraft}</button>}
    </section>}
  </section>
}
