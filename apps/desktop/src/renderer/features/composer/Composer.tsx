/**
 * [INPUT]: Workspace snapshot/calendar, visibility, the smart-input feature of useAi (switch, provider, revision, cooldown) and guarded submission.
 * [OUTPUT]: Immediate Enter capture, editable ready previews, explicit plain Later saves and revision-bound requests whose saved work survives closing.
 * [POS]: Workspace-scoped composer session; draft.ts owns ready adjustments and main owns completion after a successful save.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { IconButton } from '../../components/ui/button'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { workspaceDate } from '../../../domain/calendar'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { AnalyzeReply, Failure, PreviewWarning } from '../../../shared/contracts/smart-input'
import { horizonNames, smartMessages as t } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import type { Ai } from '../../state/ai'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/icons'
import { formatCombo, matches, useShortcuts } from '../../state/shortcuts'
import { candidateInfo, draftProblem, edited, mergePreview, plainDraft, planItems, type EditableDraft, type Field, type ParentInfo } from './draft'
import { DraftRow, type RowMenu } from './DraftRow'
import { JevBadge, Plan } from './Plan'
import { doubts, mergeIntoPrevious } from './suggestions'
import './composer.css'
import { CaptureInput } from '../../state/capture-input'

interface Props {
  snapshot: Snapshot; flows: Flows; ai: Ai; submit: (action: Action) => Promise<unknown>; busy: boolean; error: string | null; errorCode: string | null
  open: boolean; close: () => void; openSettings: () => void
}
type Phase = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ready' } | { kind: 'failed'; failure: Failure }
const debounceMs = 600
const consoleFailures = ['account_verification_required', 'quota_exhausted', 'payment_required', 'permission_denied']
const rowKeys: Record<string, RowMenu> = { KeyT: 'horizon', KeyD: 'due', KeyP: 'parent' }

export function Composer({ snapshot, flows, ai, submit, busy, error, errorCode, open, close, openSettings }: Props) {
  const status = ai.status?.features.smart, provider = status?.provider ?? null
  const enabled = !!status?.enabled
  const [text, setText] = useState('')
  const { bindings } = useShortcuts()
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [parents, setParents] = useState(() => new Map<string, ParentInfo>())
  const [warnings, setWarnings] = useState<PreviewWarning[]>([])
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewContext, setPreviewContext] = useState<string | null>(null)
  // A draft typed before (re)enabling or under another provider is never forwarded until the user asks.
  const [consentRevision, setConsentRevision] = useState<number | null>(enabled ? status!.revision : null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [fallback, setFallback] = useState(false), [composing, setComposing] = useState(false), [problem, setProblem] = useState<string | null>(null)
  // Adjust mode: one selected draft line, at most one open inline menu or title editor.
  const [adjusting, setAdjusting] = useState(false), [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<RowMenu | null>(null), [editing, setEditing] = useState(false)
  const session = useRef(new CaptureInput()), input = useRef(0), manual = useRef(0), field = useRef<HTMLTextAreaElement>(null), list = useRef<HTMLDivElement>(null)
  const latestRequest = useRef<string | null>(null), alive = useRef(true), saving = useRef(false)
  const today = workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt)
  const smartMode = enabled && consentRevision === status?.revision
  const plain = useMemo(() => plainDraft(text, null), [text])
  const contextKey = JSON.stringify([snapshot.workspace.generation, snapshot.workspace.revision, status?.revision, today, snapshot.periods.map(period => period.id)])
  const current = previewText === text.trim() && previewContext === contextKey
  const usedColors = flows.all.map(flow => flow.flowColor)
  const stateRef = useRef({ text, drafts, removed, parents, warnings, previewText, previewContext, consentRevision })
  stateRef.current = { text, drafts, removed, parents, warnings, previewText, previewContext, consentRevision }
  const contextRef = useRef({ contextKey, smartMode, open })
  contextRef.current = { contextKey, smartMode, open }

  useEffect(() => { alive.current = true; return () => {
    alive.current = false
    session.current.cancel()
  } }, [])
  useEffect(() => {
    if (open) return
    latestRequest.current = null
    setPhase({ kind: 'idle' }); setComposing(false); setAdjusting(false); setMenu(null); setEditing(false)
    session.current.cancel()
  }, [open])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (stateRef.current.text.trim()) event.preventDefault() }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  const analyze = async () => {
    const value = text.trim()
    if (!open || !status || !smartMode || !value) return
    const request = session.current.request(snapshot, status.revision, value, input.current, manual.current)
    latestRequest.current = request.requestId
    const applicable = () => alive.current && contextRef.current.open && latestRequest.current === request.requestId && input.current === request.inputRevision && contextRef.current.contextKey === contextKey && contextRef.current.smartMode
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
    if (reply.status === 'failed') { setPhase({ kind: 'failed', failure: reply.failure }); if (reply.failure.kind === 'rate_limited') void ai.refresh(); return }
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
    if (!open || !smartMode || composing || !text.trim() || current) return
    const until = provider ? ai.status?.providers[provider].cooldownUntil : null
    const cooldown = until ? Date.parse(until) - Date.now() : 0
    const timer = setTimeout(() => void analyze(), Math.max(debounceMs, cooldown))
    return () => clearTimeout(timer)
  }, [open, text, smartMode, composing, current, contextKey])
  // Status may arrive after opening: an empty composer adopts the current provider; typed text still waits for an explicit resend.
  useEffect(() => { if (!stateRef.current.text.trim()) setConsentRevision(enabled ? status!.revision : null) }, [enabled, status?.revision, text])

  const changeText = (value: string) => { input.current++; setText(value); setProblem(null); setAdjusting(false); if (phase.kind === 'failed') setPhase({ kind: 'idle' }) }
  const change = (id: string, patch: Partial<EditableDraft>, ...keys: Field[]) => {
    manual.current++
    setDrafts(rows => rows.map(row => row.id === id ? { ...row, ...patch, ...(keys.some(key => ['horizon', 'parents', 'flowColor'].includes(key)) ? { nesting: undefined } : {}), manual: [...new Set([...row.manual, ...keys])] } : row))
  }
  const replace = (next: EditableDraft) => { manual.current++; setDrafts(rows => rows.map(row => row.id === next.id ? next : row)) }
  const remove = (draft: EditableDraft) => {
    manual.current++
    if (draft.source) setRemoved(rows => [...rows, draft.source!])
    const index = drafts.findIndex(row => row.id === draft.id)
    setSelected(drafts[index + 1]?.id ?? drafts[index - 1]?.id ?? null)
    setDrafts(rows => rows.filter(row => row.id !== draft.id).map(row => ({ ...row, parents: row.parents.filter(key => key.kind !== 'draft' || key.draftId !== draft.id) })))
  }
  const merge = (id: string) => {
    const edit = mergeIntoPrevious(drafts, id)
    if (!edit) return
    manual.current++
    setDrafts(edit.drafts)
    if (edit.removedSource) setRemoved(rows => [...rows, edit.removedSource!])
    setSelected(drafts[drafts.findIndex(row => row.id === id) - 1]?.id ?? null)
  }
  const finish = () => {
    input.current++; manual.current++; latestRequest.current = null
    session.current.rotate()
    setText(''); stateRef.current.text = ''; setDrafts([]); setRemoved([]); setParents(new Map()); setWarnings([])
    setPreviewText(null); setPreviewContext(null); setPhase({ kind: 'idle' }); setFallback(false); setProblem(null)
    setAdjusting(false); setSelected(null); setMenu(null); setEditing(false)
    setConsentRevision(enabled ? status!.revision : null)
    close()
  }
  const saveLater = async (complete = false) => {
    if (!plain || busy || saving.current) return
    const revision = input.current, manualRevision = manual.current
    saving.current = true
    try {
      const currentDraft = drafts.length === 1 ? drafts[0]! : null
      const manualFields = currentDraft?.manual ?? []
      const preservePlacement = manualFields.some(field => ['horizon', 'parents', 'flowColor'].includes(field))
      const base = { draftId: 'later', title: manualFields.includes('title') ? currentDraft!.title : plain.title,
        description: manualFields.includes('description') ? currentDraft!.description : plain.description,
        dueDate: manualFields.includes('due') ? currentDraft!.due : null,
        horizon: preservePlacement ? currentDraft!.horizon : 'later' as const,
        previewPeriodId: preservePlacement && currentDraft!.horizon !== 'later' ? currentDraft!.periods?.[currentDraft!.horizon].id ?? null : null,
        parentRefs: manualFields.includes('parents') && currentDraft ? planItems([currentDraft], parents)[0]!.parentRefs : [],
        flowColor: manualFields.includes('flowColor') ? currentDraft!.flowColor : null }
      const automatic = complete && smartMode && !!status && phase.kind !== 'failed' && !manualFields.some(field => ['title', 'description', 'parents', 'flowColor'].includes(field))
      const result = await submit({ type: 'createPlan', items: [complete ? base : { draftId: 'later', title: plain.title, description: plain.description, dueDate: null, horizon: 'later', previewPeriodId: null, parentRefs: [], flowColor: null }],
        ...(automatic ? { smartCapture: { request: session.current.request(snapshot, status.revision, text, input.current, manual.current),
          allowPlacement: !manualFields.includes('horizon') && !manualFields.includes('parents') && !manualFields.includes('flowColor'),
          allowParents: !manualFields.includes('parents') && !manualFields.includes('flowColor') } } : {}) })
      if (result && alive.current && revision === input.current && manualRevision === manual.current) finish()
    } finally { saving.current = false }
  }
  const confirm = async () => {
    if (busy || saving.current || !current) return
    if (drafts.length === 1 && drafts[0]!.nesting && !drafts[0]!.manual.length) { await saveLater(true); return }
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

  // --- One primary action per state; ⌥↵ always keeps the text as a single Later. ---
  // A failed refresh may still confirm the preview of this exact text (frozen as a manual draft); anything older may not.
  const hasPlan = smartMode && drafts.length > 0 && previewText !== null
  const canConfirm = hasPlan && current
  const failed = smartMode && phase.kind === 'failed' ? phase.failure : null
  const resend = () => { setConsentRevision(status!.revision); setPreviewText(null) }
  const total = drafts.length, lands = total === 1 ? drafts[0]!.horizon : null
  const primary: { label: string; run: () => void; ready: boolean } = fallback ? { label: t.fallbackConfirm, run: () => void saveLater(), ready: !!plain }
    : !smartMode ? { label: t.saveLater, run: () => void saveLater(), ready: !!plain }
    : canConfirm ? { label: total > 1 ? t.createCount(total) : lands && lands !== 'later' ? t.createTo(horizonNames[lands]) : t.saveLater, run: () => void confirm(), ready: true }
    : { label: t.captureNow, run: () => void saveLater(true), ready: !!plain }
  const runPrimary = () => { if (primary.ready && !busy) primary.run() }
  const keepText = () => { if (smartMode && edited(drafts) > 0) setFallback(true); else void saveLater() }

  const startAdjust = () => {
    if (!hasPlan) return
    setAdjusting(true); setMenu(null); setEditing(false)
    setSelected(previous => drafts.some(row => row.id === previous) ? previous : (drafts.find(row => doubts(row, drafts, parents).length) ?? drafts[0]!).id)
  }
  const stopAdjust = () => { setAdjusting(false); setMenu(null); setEditing(false); field.current?.focus() }
  const selectedDraft = drafts.find(row => row.id === selected) ?? null
  // Keyboard focus follows the selected line whenever no menu or editor holds it.
  useEffect(() => { if (adjusting && !menu && !editing) list.current?.querySelector<HTMLElement>('.plan-focus')?.focus() }, [adjusting, selected, menu, editing, drafts.length])

  const fieldKeys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing || event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && fallback) { event.preventDefault(); setFallback(false); return }
    if (event.key === 'Enter' && event.altKey) { event.preventDefault(); keepText(); return }
    // ↵ commits like an input method; ⇧↵ stays a newline for the rare multi-line note.
    if ((event.key === 'Enter' && !event.shiftKey) || matches(event, bindings.submit)) { event.preventDefault(); runPrimary(); return }
    if (event.key === 'Tab' && !event.shiftKey && hasPlan && !fallback) { event.preventDefault(); startAdjust() }
  }
  const listKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) return
    if (event.key === 'Enter' && event.altKey) { event.preventDefault(); keepText(); return }
    if (event.altKey || !selectedDraft) return
    const index = drafts.indexOf(selectedDraft)
    const onToken = event.target instanceof HTMLElement && !!event.target.closest('.plan-token')
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = drafts[index + (event.key === 'ArrowDown' ? 1 : -1)]
      if (next) { setSelected(next.id); setMenu(null) }
    } else if (event.key === 'Escape') { event.preventDefault(); stopAdjust() }
    else if (event.key === 'Enter' && !onToken) { event.preventDefault(); runPrimary() }
    else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); remove(selectedDraft) }
    else if (rowKeys[event.code]) { event.preventDefault(); setMenu(rowKeys[event.code]!) }
    else if (event.code === 'KeyE') { event.preventDefault(); setEditing(true) }
    else if (event.code === 'KeyM' && doubts(selectedDraft, drafts, parents).some(row => row.kind === 'role')) { event.preventDefault(); merge(selectedDraft.id) }
  }

  const hint = (keys: string, label: string) => <span className="composer-hint inline-flex items-center gap-[5px]"><kbd className="keycap">{keys}</kbd>{label}</span>
  const enter = formatCombo('Enter'), altEnter = formatCombo('Alt+Enter')
  const primaryButton = <button type="button" className="composer-primary shrink-0 inline-flex items-center gap-2 h-7.5 pt-0 pr-2 pb-0 pl-3 rounded-[8px] bg-foreground text-surface text-[13px] font-semibold" disabled={busy || !primary.ready} onClick={runPrimary}>{primary.label}<kbd className="keycap">{enter}</kbd></button>
  const keepHint = plain && !fallback ? hint(altEnter, t.keepAsLater) : null
  const globalWarnings = warnings.filter(row => row.draftId === null && row.kind !== 'layout').map(row => row.text)
  const futureNote = drafts.some(row => row.future && row.horizon === 'later') ? warnings.find(row => row.kind === 'future')?.text : undefined
  const notes = [...globalWarnings, ...(drafts.some(row => row.orphan) ? [t.orphanNote] : []), ...(futureNote ? [futureNote] : []), ...(failed && canConfirm ? [t.frozenNote] : [])]
  const strip = (tone: string, line: ReactNode, hints: ReactNode, body?: ReactNode) => <section className="composer-cand flex flex-col gap-2.5 pt-3 pr-3 pb-2.5 pl-3.5 rounded-[10px]" data-tone={tone} aria-live="polite">
    <div className="cand-line flex items-start gap-2.5 min-h-7.5 text-[14px] leading-[22px]">{line}</div>
    {body}
    {notes.map((note, index) => <p key={index} className="cand-note flex items-start gap-2 m-0 text-[12px] leading-[1.6] text-warning"><Icon name="warning" size={14} />{note}</p>)}
    {hints && <div className="cand-hints flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12px] text-muted-foreground">{hints}</div>}
  </section>

  let content: ReactNode = null
  if (!text.trim()) content = null
  else if (fallback) content = strip('plain', <><span className="cand-text flex-1 min-w-0 pt-1">{t.fallbackBody(edited(drafts))}</span>{primaryButton}</>, hint('Esc', t.back))
  else if (!smartMode && !enabled) content = strip('plain', <><button type="button" className="cand-link self-center flex-1 text-left text-[13px] text-focus" onClick={() => { close(); openSettings() }}>{t.connectJev} →</button>{primaryButton}</>,
    null, plain?.description ? <p className="cand-note flex items-start gap-2 m-0 text-[12px] leading-[1.6] text-warning">{t.descriptionKept}</p> : undefined)
  else if (!smartMode) content = strip('plain', <><span className="cand-text flex-1 min-w-0 pt-1" role="status">{t.providerChanged}<button type="button" className="cand-link self-center flex-1 text-left text-[13px] text-focus" onClick={resend}>{t.resend}</button></span>{primaryButton}</>, keepHint)
  else if (failed && !canConfirm) content = strip('failed', <><JevBadge /><span className="cand-text flex-1 min-w-0 pt-1" role="alert">{failed.message}</span>
    <button type="button" className="cand-link self-center flex-1 text-left text-[13px] text-focus" onClick={() => void analyze()}>{t.retry}</button>
    {consoleFailures.includes(failed.kind) && provider && <button type="button" className="cand-link self-center flex-1 text-left text-[13px] text-focus" onClick={() => ai.openConsole(provider)}>{t.getKey}</button>}{primaryButton}</>, keepHint)
  else if (hasPlan && adjusting) content = strip('jev', <><JevBadge /><span className="cand-text flex-1 min-w-0 pt-1">{t.adjustHeading}</span>{primaryButton}</>,
    <>{hint('↑↓', t.hintSelect)}{hint('T D P', t.hintFields)}{hint('E', t.hintEdit)}{hint(formatCombo('Backspace'), t.hintRemove)}{hint('Esc', t.back)}</>,
    <div ref={list} className="plan-list flex flex-col gap-0.5 mx-[-6px] my-0" role="listbox" aria-label={t.adjustHeading} onKeyDown={listKeys}>
      {drafts.map(draft => <DraftRow key={draft.id} draft={draft} drafts={drafts} parents={parents} flows={flows} usedColors={usedColors} periods={snapshot.periods} today={today} weekStart={snapshot.workspace.calendar!.weekStart} disabled={busy}
        selected={draft.id === selected} menu={draft.id === selected ? menu : null} editing={draft.id === selected && editing}
        select={() => { setSelected(draft.id); setMenu(null); setEditing(false) }} openMenu={setMenu} stopEditing={() => setEditing(false)}
        change={(patch, ...fields) => change(draft.id, patch, ...fields)} replace={replace} remember={info => setParents(previous => new Map(previous).set(info.itemId, info))} merge={() => merge(draft.id)} />)}
    </div>)
  // While a newer text is being organized, the last recommendation stays (dimmed) instead of flickering away.
  else if (hasPlan) content = strip(current ? 'jev' : 'stale', <><JevBadge /><div className="cand-text flex-1 min-w-0 pt-1"><Plan drafts={drafts} parents={parents} /></div>{primaryButton}</>, <>{hint('Tab', t.adjust)}{keepHint}</>)
  else content = strip('jev', <><JevBadge /><span className="cand-text cand-pending flex-1 min-w-0 flex gap-1.5 pt-2.5" role="status"><span className="cand-skeleton" /><span className="cand-skeleton" data-long="true" /></span>{primaryButton}</>, <><span className="cand-state self-center shrink-0 text-[12.5px] text-muted-foreground">{t.smartPending}</span>{keepHint}</>)

  if (!open) return null
  return <Modal title={t.composer} close={close} className="palette composer-modal"
    actions={text.trim() ? <IconButton type="button" aria-label={t.discard} title={t.discard} onClick={finish}><Icon name="delete" size={16} /></IconButton> : null}
    heading={<div className="palette-search composer-search">
      <Icon name="add" size={18} />
      <textarea ref={field} className="composer-input flex-1 min-w-0 w-auto min-h-6 max-h-42 p-0 text-[15px] leading-[24px] text-foreground" aria-label={t.inputLabel} placeholder={t.placeholder} autoFocus value={text} rows={1} maxLength={20_000}
        onChange={event => changeText(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={fieldKeys} />
    </div>}>
    <div className="composer-body flex flex-col gap-1.5">
      {(error || problem) && <p className="inline-error composer-error mt-0.5 mr-2.5 mb-0 ml-2.5" role="alert">{problem ?? error}</p>}
      {content}
    </div>
  </Modal>
}
