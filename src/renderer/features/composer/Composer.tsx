/**
 * [INPUT]: Snapshot, smart-input state, guarded submission and session draft.
 * [OUTPUT]: Revision-aware analysis, editable previews, bounded parent metadata and safe createPlan confirmation.
 * [POS]: Global composer; preserves newer input and removals and invalidates outdated preview context.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { workspaceDate } from '../../../domain/calendar'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { AnalyzeReply, Failure, PreviewWarning } from '../../../shared/contracts/smart-input'
import { smartMessages as t } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import type { Smart } from '../../state/smart'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/icons'
import { formatCombo, matches, useShortcuts } from '../../state/shortcuts'
import { candidateInfo, draftProblem, edited, mergePreview, plainDraft, planItems, type EditableDraft, type Field, type ParentInfo } from './draft'
import { DraftCard } from './DraftCard'
import './composer.css'

export interface ComposerMemory { text: string; drafts: EditableDraft[]; removed: string[]; parents: [string, ParentInfo][]; warnings: PreviewWarning[]; previewText: string | null; previewContext: string | null; consentRevision: number | null }
interface Props {
  snapshot: Snapshot; flows: Flows; smart: Smart; submit: (action: Action) => Promise<unknown>; busy: boolean; error: string | null; errorCode: string | null
  memory: ComposerMemory | null; keep: (memory: ComposerMemory | null) => void; close: () => void; openSettings: () => void
}
type Phase = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ready' } | { kind: 'failed'; failure: Failure }
const debounceMs = 600

export function Composer({ snapshot, flows, smart, submit, busy, error, errorCode, memory, keep, close, openSettings }: Props) {
  const status = smart.status
  const enabled = !!status?.enabled
  const [text, setText] = useState(memory?.text ?? '')
  const { bindings } = useShortcuts()
  const [drafts, setDrafts] = useState<EditableDraft[]>(memory?.drafts ?? [])
  const [removed, setRemoved] = useState<string[]>(memory?.removed ?? [])
  const [parents, setParents] = useState(() => new Map(memory?.parents ?? []))
  const [warnings, setWarnings] = useState<PreviewWarning[]>(memory?.warnings ?? [])
  const [previewText, setPreviewText] = useState<string | null>(memory?.previewText ?? null)
  const [previewContext, setPreviewContext] = useState<string | null>(memory?.previewContext ?? null)
  // A draft typed before (re)enabling or under another provider is never forwarded until the user asks.
  const [consentRevision, setConsentRevision] = useState<number | null>(memory ? memory.consentRevision : enabled ? status!.providerRevision : null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [fallback, setFallback] = useState(false), [composing, setComposing] = useState(false), [problem, setProblem] = useState<string | null>(null)
  const session = useRef(crypto.randomUUID()), input = useRef(0), manual = useRef(0), field = useRef<HTMLTextAreaElement>(null)
  const latestRequest = useRef<string | null>(null), alive = useRef(true), saving = useRef(false)
  const today = workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt)
  const smartMode = enabled && consentRevision === status?.providerRevision
  const plain = useMemo(() => plainDraft(text, null), [text])
  const contextKey = JSON.stringify([snapshot.workspace.generation, snapshot.workspace.revision, status?.providerRevision, today, snapshot.periods.map(period => period.id)])
  const current = previewText === text.trim() && previewContext === contextKey
  const usedColors = flows.all.map(flow => flow.flowColor)
  const stateRef = useRef({ text, drafts, removed, parents, warnings, previewText, previewContext, consentRevision })
  stateRef.current = { text, drafts, removed, parents, warnings, previewText, previewContext, consentRevision }
  const contextRef = useRef({ contextKey, smartMode })
  contextRef.current = { contextKey, smartMode }

  useEffect(() => { alive.current = true; return () => {
    alive.current = false
    void desktopApi().smart({ type: 'cancel', draftSessionId: session.current }).catch(() => null)
    const state = stateRef.current
    keep(state.text.trim() ? { ...state, parents: [...state.parents] } : null)
  } }, [])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (stateRef.current.text.trim()) event.preventDefault() }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  const analyze = async () => {
    const value = text.trim()
    if (!status || !smartMode || !value) return
    const request = { requestId: crypto.randomUUID(), draftSessionId: session.current, inputRevision: input.current, manualRevision: manual.current, generation: snapshot.workspace.generation,
      providerRevision: status.providerRevision, contextRevision: snapshot.workspace.revision, referenceTime: snapshot.observedAt, text: value, parentHints: [] }
    latestRequest.current = request.requestId
    const applicable = () => alive.current && latestRequest.current === request.requestId && input.current === request.inputRevision && contextRef.current.contextKey === contextKey && contextRef.current.smartMode
    setPhase({ kind: 'pending' })
    let reply: AnalyzeReply
    try {
      const result = await desktopApi().smart({ type: 'analyze', request })
      if (result.type !== 'analysis') return
      reply = result.reply
    } catch { if (applicable()) setPhase({ kind: 'failed', failure: { kind: 'unavailable', message: t.analyzeFailed, status: null, retryAt: null } }); return }
    // --- Only an answer for this exact input, manual state, provider and context may touch the preview. ---
    if (!applicable() || reply.echo.requestId !== request.requestId || reply.echo.inputRevision !== input.current || reply.echo.contextRevision !== request.contextRevision || reply.echo.generation !== request.generation || reply.echo.providerRevision !== request.providerRevision) return
    if (reply.status === 'cancelled') return
    if (reply.echo.manualRevision !== manual.current) { void analyzeRef.current(); return }
    if (reply.status === 'failed') { setPhase({ kind: 'failed', failure: reply.failure }); if (reply.failure.kind === 'rate_limited') void smart.refresh(); return }
    if (reply.preview.referenceDate !== today || snapshot.periods.some(period => reply.preview.periods[period.horizon]?.id !== period.id)) { setProblem(t.stalePeriod); setPhase({ kind: 'idle' }); return }
    const merged = mergePreview(reply.preview, stateRef.current.drafts, stateRef.current.removed)
    setDrafts(merged)
    const referenced = new Set(merged.flatMap(draft => [...draft.parents, ...draft.parentSuggestions].flatMap(parent => parent.kind === 'existing' ? [parent.itemId] : [])))
    setParents(previous => new Map([...previous].filter(([id]) => referenced.has(id)).concat([...candidateInfo(reply.preview.candidates)])))
    setWarnings(reply.preview.warnings); setPreviewText(value); setPreviewContext(contextKey); setPhase({ kind: 'ready' }); setProblem(null)
  }
  const analyzeRef = useRef(analyze)
  analyzeRef.current = analyze
  useEffect(() => {
    if (!smartMode || composing || !text.trim() || current) return
    const cooldown = status?.cooldownUntil ? Date.parse(status.cooldownUntil) - Date.now() : 0
    const timer = setTimeout(() => void analyze(), Math.max(debounceMs, cooldown))
    return () => clearTimeout(timer)
  }, [text, smartMode, composing, current, contextKey])
  // Status may arrive after opening: an empty composer adopts the current provider; typed text still waits for an explicit resend.
  useEffect(() => { if (consentRevision === null && enabled && !stateRef.current.text.trim()) setConsentRevision(status!.providerRevision) }, [enabled])

  const changeText = (value: string) => { input.current++; setText(value); setProblem(null); if (phase.kind === 'failed') setPhase({ kind: 'idle' }) }
  const change = (id: string, patch: Partial<EditableDraft>, key: Field) => {
    manual.current++
    setDrafts(rows => rows.map(row => row.id === id ? { ...row, ...patch, manual: row.manual.includes(key) ? row.manual : [...row.manual, key] } : row))
  }
  const remove = (draft: EditableDraft) => {
    manual.current++
    if (draft.source) setRemoved(rows => [...rows, draft.source!])
    setDrafts(rows => rows.filter(row => row.id !== draft.id).map(row => ({ ...row, parents: row.parents.filter(key => key.kind !== 'draft' || key.draftId !== draft.id) })))
  }
  const finish = () => { setText(''); stateRef.current.text = ''; keep(null); close() }
  const saveLater = async () => {
    if (!plain || busy || saving.current) return
    const revision = input.current, manualRevision = manual.current
    saving.current = true
    try {
      const result = await submit({ type: 'createPlan', items: [{ draftId: 'later', title: plain.title, description: plain.description, dueDate: null, horizon: 'later', previewPeriodId: null, parentRefs: [], flowColor: null }] })
      if (result && alive.current && revision === input.current && manualRevision === manual.current) finish()
    } finally { saving.current = false }
  }
  const confirm = async () => {
    if (busy || saving.current || !current) return
    const issue = draftProblem(drafts, parents, usedColors)
    if (issue) { setProblem(issue); return }
    const revision = input.current, manualRevision = manual.current
    saving.current = true
    try {
      const result = await submit({ type: 'createPlan', items: planItems(drafts, parents) })
      if (result && alive.current && revision === input.current && manualRevision === manual.current) finish()
    } finally { saving.current = false }
  }
  // A day/week/month boundary passed since the preview: refresh dates rather than silently re-scheduling.
  useEffect(() => { if (errorCode === 'stale_preview') { setPreviewText(null); setProblem(t.stalePeriod) } }, [errorCode])
  // A failed refresh may still confirm the preview of this exact text (frozen as a manual draft); anything older may not.
  const canConfirm = smartMode && drafts.length > 0 && previewText !== null && current
  const primary = () => { if (!smartMode) void saveLater(); else if (canConfirm) void confirm() }
  const askFallback = () => { if (smartMode && edited(drafts) > 0) setFallback(true); else void saveLater() }
  const dismissible = (notice: 'globalEntry' | 'smartSetup', body: string, action?: { label: string; run: () => void }) => status && !status.dismissed.includes(notice) &&
    <div className="composer-tip"><Icon name="smart" size={14} /><span>{body}</span>{action && <button type="button" className="text-button small" onClick={action.run}>{action.label}</button>}<button type="button" className="icon-button small" aria-label={t.dismiss} onClick={() => void smart.dismiss(notice)}><Icon name="close" size={12} /></button></div>
  const statusLine = !smartMode ? (enabled ? t.providerChanged : t.plainMode)
    : phase.kind === 'pending' ? t.smartPending : phase.kind === 'failed' ? phase.failure.message : current && drafts.length ? t.smartReady(drafts.length) : previewText ? t.smartStale : t.smartIdle

  return <Modal title={t.composer} close={close} className="composer-modal">
    {dismissible('globalEntry', t.entryTip)}
    {/* One tip at a time keeps the input calm; the settings hint only follows once the entry tip is gone. */}
    {!enabled && status?.dismissed.includes('globalEntry') && dismissible('smartSetup', t.setupTip, { label: t.openSettings, run: () => { close(); openSettings() } })}
    <div className="composer-body" onKeyDown={event => {
      if (composing || !matches(event, bindings.submit)) return
      event.preventDefault(); primary()
    }}>
    <textarea ref={field} className="composer-input" aria-label={t.inputLabel} placeholder={t.placeholder} autoFocus value={text} rows={4} maxLength={20_000}
      onChange={event => changeText(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
    <p className="composer-status" role="status" data-failed={phase.kind === 'failed'}>
      {phase.kind === 'pending' && <span className="composer-spinner" aria-hidden="true" />}{statusLine}
      {enabled && !smartMode && <button type="button" className="text-button small" onClick={() => { setConsentRevision(status!.providerRevision); setPreviewText(null) }}>{t.resend}</button>}
      {phase.kind === 'failed' && <button type="button" className="text-button small" onClick={() => void analyze()}>{t.retry}</button>}
      {phase.kind === 'failed' && ['account_verification_required', 'quota_exhausted', 'payment_required', 'permission_denied'].includes(phase.failure.kind) && status?.activeProvider && <button type="button" className="text-button small" onClick={() => smart.openConsole(status.activeProvider!)}>{t.getKey}</button>}
    </p>
    {phase.kind === 'failed' && current && drafts.length > 0 && <p className="composer-note">{t.frozenNote}</p>}
    {(error || problem) && <p className="inline-error" role="alert">{problem ?? error}</p>}
    {fallback ? <div className="composer-fallback" role="alertdialog" aria-label={t.fallbackTitle}>
      <strong>{t.fallbackTitle}</strong><p>{t.fallbackBody(edited(drafts))}</p>
      <div className="composer-actions"><button type="button" className="settings-button" onClick={() => setFallback(false)}>{t.back}</button><button type="button" className="settings-button primary" disabled={busy} onClick={() => void saveLater()}>{t.fallbackConfirm}</button></div>
    </div> : <section className="composer-preview" aria-live="polite">
      {!smartMode && plain && <div className="draft-card plain"><div className="draft-head"><span className="draft-target">{t.plainTarget}</span><span className="draft-title-text">{plain.title}</span></div>{plain.description && <small className="muted">{t.descriptionKept}</small>}</div>}
      {smartMode && previewText !== null && <>
        {warnings.filter(row => row.draftId === null).map((row, index) => <p key={index} className="composer-warning"><Icon name="warning" size={14} />{row.text}</p>)}
        {drafts.some(row => row.orphan) && <p className="composer-warning"><Icon name="warning" size={14} />{t.orphanNote}</p>}
        {drafts.map(draft => <div key={draft.id}>
          <DraftCard draft={draft} drafts={drafts} parents={parents} flows={flows} usedColors={usedColors} periods={snapshot.periods} today={today} disabled={busy}
            change={(patch, key) => change(draft.id, patch, key)} remember={info => setParents(previous => new Map(previous).set(info.itemId, info))} remove={() => remove(draft)} />
          {draft.future && draft.horizon === 'later' && <p className="composer-warning inset">{warnings.find(row => row.kind === 'future')?.text}</p>}
        </div>)}
      </>}
    </section>}
    </div>
    <footer className="modal-footer composer-footer">
      {text.trim() && <button type="button" className="text-button small" onClick={finish}>{t.discard}</button>}
      <span className="composer-spacer" />
      {smartMode && <button type="button" className="settings-button" disabled={busy || !plain} onClick={askFallback}>{t.laterFallback}</button>}
      <button type="button" className="settings-button primary" disabled={busy || !plain || (smartMode && !canConfirm)} onClick={primary}>
        {smartMode ? t.confirm(drafts.length) : t.saveLater}{bindings.submit && <kbd>{formatCombo(bindings.submit)}</kbd>}
      </button>
    </footer>
  </Modal>
}
