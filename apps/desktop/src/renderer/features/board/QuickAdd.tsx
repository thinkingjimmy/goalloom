/**
 * [INPUT]: Displayed period/insertion and preceding outline root, period-keyed drafts, shared AI state, workspace snapshot and guarded submission.
 * [OUTPUT]: Immediate inline creation, visible revision-bound matching/retry/consent feedback, preserved drafts and explicit manual flow priority;
 *           retains two-level Tab drafts and inherited flow context, grows with content/column width and offers only longer-horizon flow roots.
 * [POS]: Immediate board creation; CaptureInput binds draft revisions, main completes optional parents and storage owns relationship constraints.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { menuStyles } from '../../components/ui/menu'
import { cn } from '../../lib/utils'
import { TextButton } from '../../components/ui/button'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ItemHorizon, ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import { mayParent } from '../../../domain/relations'
import { messages, smartMessages as t } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars, relationColors } from '../../lib/colors'
import { FlowMark } from '../../components/FlowMark'
import { Popover } from '../../components/Popover'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { Ai } from '../../state/ai'
import { CaptureInput } from '../../state/capture-input'
import type { SemanticParent } from '../../../shared/contracts/capture'
import { Icon } from '../../components/icons'
import { nestingText } from '../../../shared/i18n/nesting'

export interface SplitParent { id: string; title: string }
type Choice = { kind: 'none' } | { kind: 'join'; id: string } | { kind: 'new'; color: number } | { kind: 'split'; parent: SplitParent }
interface NestingDraft extends SplitParent { version: number; placementVersion: number }
export interface QuickAddDraft { title: string; choice: Choice; manualFlow?: boolean; smartConsent?: number | null; nesting?: NestingDraft | null }
type Matching = { key: string } & ({ kind: 'pending' } | { kind: 'ready'; parents: SemanticParent[] } | { kind: 'failed'; message: string })

export function QuickAdd({ horizon, period, beforeId, periodName, expired, retarget, drafts, flows, items, split, nestingTarget, submit, busy, close, snapshot, ai }: { horizon: ItemHorizon; period: PlanningPeriod | null; beforeId?: string | null | undefined; periodName: string; expired: boolean; retarget: () => void; drafts: Map<string, QuickAddDraft>; flows: Flows; items: ItemSummary[]; split: SplitParent | null; nestingTarget?: ItemSummary | null; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void; snapshot?: Snapshot; ai?: Ai | undefined }) {
  const draftKey = period?.id ?? 'later'
  const [title, setTitle] = useState(() => drafts.get(draftKey)?.title ?? '')
  const [choice, setChoice] = useState<Choice>(() => split ? { kind: 'split', parent: split } : drafts.get(draftKey)?.choice ?? { kind: 'none' })
  const [nesting, setNesting] = useState<NestingDraft | null>(() => drafts.get(draftKey)?.nesting ?? null)
  const nestingParent = nesting ? items.find(item => item.id === nesting.id) : undefined
  const status = ai?.status?.features.smart
  const [manualFlow, setManualFlow] = useState(() => !!split || drafts.get(draftKey)?.manualFlow || choice.kind !== 'none')
  const [smartConsent, setSmartConsent] = useState(() => drafts.get(draftKey)?.smartConsent !== undefined ? drafts.get(draftKey)!.smartConsent! : status?.enabled ? status.revision : null)
  const [composing, setComposing] = useState(false)
  const capture = useRef(new CaptureInput()), manualRevision = useRef(0)
  const revision = useRef(0), saving = useRef(false), choiceRef = useRef(choice)
  const [matching, setMatching] = useState<Matching | null>(null), [attempt, setAttempt] = useState(0)
  useLayoutEffect(() => { drafts.set(draftKey, { title, choice, manualFlow, smartConsent, nesting }) }, [drafts, draftKey, title, choice, manualFlow, smartConsent, nesting])
  const canMatch = !!snapshot && !!status?.enabled && smartConsent === status.revision && !manualFlow && !nesting && horizon !== 'later' && !expired
  const request = () => capture.current.request(snapshot!, status!.revision, title, revision.current, manualRevision.current, { horizon, startDate: period?.startDate ?? null })
  const matchingKey = JSON.stringify([capture.current.sessionId, title.trim(), revision.current, manualRevision.current, snapshot?.workspace.generation, snapshot?.workspace.revision, snapshot?.periods.map(period => period.id), status?.revision, period?.id])
  const currentMatch = canMatch && !composing && matching?.key === matchingKey ? matching : null
  const needsConsent = !!snapshot && !!status?.enabled && smartConsent !== status.revision && !manualFlow && !nesting && horizon !== 'later' && !expired && !!title.trim()
  useEffect(() => { if (!title.trim()) setSmartConsent(status?.enabled ? status.revision : null) }, [title, status?.enabled, status?.revision])
  useEffect(() => {
    capture.current.cancel()
    if (!canMatch || composing || !title.trim()) return
    let active = true
    const timer = setTimeout(async () => {
      const submitted = request()
      setMatching({ key: matchingKey, kind: 'pending' })
      try {
        const result = await desktopApi().smart({ type: 'analyze', request: submitted })
        if (!active || result.type !== 'analysis' || result.reply.echo.requestId !== submitted.requestId) return
        const reply = result.reply
        if (reply.status === 'cancelled') { setMatching(null); return }
        if (reply.status === 'failed') {
          setMatching({ key: matchingKey, kind: 'failed', message: reply.failure.message })
          if (reply.failure.kind === 'rate_limited') void ai?.refresh()
        } else setMatching({ key: matchingKey, kind: 'ready', parents: reply.preview.capture?.parents ?? [] })
      } catch { if (active) setMatching({ key: matchingKey, kind: 'failed', message: t.analyzeFailed }) }
    }, 600)
    return () => { active = false; clearTimeout(timer) }
  }, [matchingKey, canMatch, composing, attempt])
  useEffect(() => () => capture.current.cancel(), [])
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), root = useRef<HTMLDivElement>(null)
  choiceRef.current = choice
  // Joining links the new item under the flow root, so the root must sit in a longer horizon; Later starts no flow.
  const joinable = flows.visible.filter(flow => { const root = items.find(item => item.id === flow.id); return !!root && mayParent(root.placement.horizon, horizon) })
  const free = horizon === 'later' ? [] : relationColors.map((_, index) => index).filter(index => !flows.owner(index))
  const flowless = !!nesting || horizon === 'later' && !split
  const parentId = nesting ? null : choice.kind === 'join' ? choice.id : choice.kind === 'split' ? choice.parent.id : null
  const suggested = currentMatch?.kind === 'ready' ? currentMatch.parents : []
  const colors = horizon === 'later' ? [] : nesting ? flows.colorsOf(nesting.id) : choice.kind === 'new' ? [choice.color] : parentId ? flows.colorsOf(parentId) : [...new Set(suggested.flatMap(parent => flows.colorsOf(parent.itemId)))]
  const ring = flowVars(colors)
  const label = choice.kind === 'new' ? messages.newFlowName(messages.colorNames[choice.color]!)
    : choice.kind === 'join' ? messages.joinHint(flows.all.find(flow => flow.id === choice.id)?.title ?? '')
    : choice.kind === 'split' ? messages.splitHint(choice.parent.title) : suggested.length ? t.under(suggested.map(parent => parent.title)) : messages.noFlow
  const pick = (next: Choice) => { manualRevision.current++; setManualFlow(true); setChoice(next); setPicking(false); input.current?.focus() }
  const changeNesting = (next: ItemSummary | null) => {
    revision.current++; manualRevision.current++; capture.current.cancel(); setMatching(null); setPicking(false)
    setNesting(next ? { id: next.id, title: next.title, version: next.version, placementVersion: next.placement.version } : null)
  }
  const nestingLabel = nesting ? `${nestingText().belongsTo} ${nestingParent?.title ?? nesting.title}` : undefined
  const create = async () => {
    const text = title.trim()
    if (!text || busy || saving.current) return
    const submittedRevision = revision.current
    saving.current = true
    try {
      const expectedParentVersion = parentId ? (await desktopApi().getItem(parentId).catch(() => null))?.item.version ?? null : null
      if (parentId && expectedParentVersion === null) return
      const result = await submit({ type: 'create', title: text, horizon, ...(period ? { period: { kind: 'date' as const, startDate: period.startDate } } : {}), ...(beforeId !== undefined ? { beforeId } : {}), parentId, expectedParentVersion, flowColor: !nesting && choice.kind === 'new' ? choice.color : null,
        ...(nesting ? { nesting: { parentId: nesting.id, expectedParentVersion: nestingParent?.version ?? nesting.version, expectedParentPlacementVersion: nestingParent?.placement.version ?? nesting.placementVersion } } : {}),
        ...(canMatch ? { smartCapture: { request: request(), allowPlacement: false, allowParents: true } } : {}) })
      if (!result) return
      capture.current.rotate()
      if (revision.current === submittedRevision) setTitle('')
      else setAttempt(value => value + 1)
      // The new item now owns the colour, so following entries join that flow.
      const created = (result as { itemId: string | null }).itemId
      if (!nesting && choice.kind === 'new' && created && choiceRef.current === choice) setChoice({ kind: 'join', id: created })
      input.current?.focus()
    } finally { saving.current = false }
  }
  return <div className="quick-add" data-nested={!!nesting} data-nesting-parent={nesting?.id} ref={root} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget as Node | null) && !title.trim() && !picking) close()
  }}>
    {flowless ? <span className={`check ${ring ? '' : 'check-dashed'}`} style={ring} aria-hidden="true" /> : <Popover open={picking} onClose={() => setPicking(false)} anchor={
      <button type="button" className={`check ${ring ? '' : 'check-dashed'}`} style={ring} aria-label={messages.chooseFlow(label)} aria-haspopup="listbox" aria-expanded={picking} onMouseDown={event => event.preventDefault()} onClick={() => setPicking(!picking)} />
    }>
      <div className={cn(menuStyles.surface, 'menu flow-picker')} role="listbox" aria-label={messages.flow}>
        {joinable.length > 0 && <p className={cn(menuStyles.heading, 'menu-heading')}>{messages.joinFlow}</p>}
        {joinable.map(flow => <button key={flow.id} role="option" aria-selected={choice.kind === 'join' && choice.id === flow.id} className={cn(menuStyles.item, 'menu-item')} onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'join', id: flow.id })}>
          <FlowMark colors={[flow.flowColor]} /><span className={cn(menuStyles.text, 'menu-text')}>{flow.title}</span>
        </button>)}
        {joinable.length > 0 && <div className={cn(menuStyles.separator, 'menu-separator')} />}
        <p className={cn(menuStyles.heading, 'menu-heading')}>{messages.newFlow}</p>
        <div className="swatches">
          <button role="option" aria-selected={choice.kind === 'none' && !suggested.length} aria-label={messages.noFlow} title={messages.noFlow} className="swatch" onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'none' })}><FlowMark colors={[]} dashed /></button>
          {free.map(index => <button key={index} role="option" aria-selected={choice.kind === 'new' && choice.color === index} aria-label={messages.newFlowName(messages.colorNames[index]!)} title={messages.colorNames[index]!} className="swatch" onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'new', color: index })}><FlowMark colors={[index]} /></button>)}
        </div>
      </div>
    </Popover>}
    <textarea ref={input} className="quick-add-title" aria-label={messages.newToColumn(periodName)} aria-description={nestingLabel} placeholder={messages.titlePlaceholder} autoFocus value={title} rows={1} maxLength={500}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onChange={event => { revision.current++; setTitle(event.target.value.replace(/\r?\n/g, ' ')) }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing) return
        if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.shiftKey && nesting) { event.preventDefault(); changeNesting(null) }
          else if (!event.shiftKey && !nesting && !expired && nestingTarget && !nestingTarget.archivedAt && nestingTarget.status !== 'cancelled' && !nestingTarget.placement.nestingParentId && nestingTarget.placement.horizon === horizon && nestingTarget.placement.periodId === (period?.id ?? null)) {
            event.preventDefault(); changeNesting(nestingTarget)
          }
        }
        if (event.key === 'Enter') { event.preventDefault(); void create() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      }} />
    {expired ? <span className="quick-add-expired" role="status">{messages.expiredDraft}<TextButton type="button" disabled={busy} onClick={retarget}>{messages.useDisplayedPeriod}</TextButton></span>
      : nesting ? <span className="quick-add-hint" role="status">{nestingLabel}</span>
      : choice.kind !== 'none' && <span className="quick-add-hint" aria-hidden="true">{label}</span>}
    {(needsConsent || currentMatch) && <div className="quick-add-smart" role="status" aria-live="polite" aria-atomic="true" data-phase={needsConsent ? 'consent' : currentMatch?.kind}>
      <Icon name="smart" size={12} />
      <span>{needsConsent ? smartConsent === null ? t.inlineConsent : t.providerChanged
        : currentMatch?.kind === 'pending' ? t.inlinePending
        : currentMatch?.kind === 'failed' ? currentMatch.message
        : suggested.length ? `Jev · ${t.under(suggested.map(parent => parent.title))}` : t.inlineNoMatch}</span>
      {(needsConsent || currentMatch?.kind === 'failed') && <TextButton type="button" disabled={busy} onClick={() => {
        if (needsConsent) setSmartConsent(status!.revision)
        else setAttempt(value => value + 1)
        input.current?.focus()
      }}>{needsConsent ? t.resend : t.retry}</TextButton>}
    </div>}
  </div>
}
