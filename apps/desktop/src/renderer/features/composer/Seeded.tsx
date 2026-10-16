/**
 * [INPUT]: A ComposerSeed (target column/period, parent or batch parents), the snapshot/flows for drafting, insight readiness and guarded submission.
 * [OUTPUT]: The ⌘N composer with prefilled context, one title or a checked batch with a horizon-specific heading; one draft request per mount, editable fallback and typed-text precedence over late results.
 * [POS]: Prefill mode of the global composer for flow-insight entries; same modal, keys and styles, but no Jev analysis — the context is already decided.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { insightMessages as t, smartMessages } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { requestDraft } from '../../state/insight'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/icons'
import { formatCombo } from '../../state/shortcuts'
import { boardDigest, periodText, type ChildHorizon } from '../insight/signals'
import { planningLabel } from '../../lib/periods'
import './composer.css'

export interface ComposerSeed {
  key: number
  mode: 'next' | 'batch' | 'free'
  horizon: ChildHorizon
  period: PlanningPeriod
  next: boolean
  parent: ItemSummary | null
  // Batch only: one row per parent; titles arrive from the model when `draft` is set.
  parents: ItemSummary[]
  draft: boolean
  note: string | null
  // Lets the breakpoint layer point at a step written into the next period, which this column does not show.
  onCreated?: (title: string) => void
}
interface Row { parent: ItemSummary; title: string; on: boolean; typed: boolean }

export function Seeded({ seed, snapshot, flows, submit, busy, error, close }: { seed: ComposerSeed; snapshot: Snapshot; flows: Flows; submit: (action: Action) => Promise<unknown>; busy: boolean; error: string | null; close: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>(() => seed.parents.map(parent => ({ parent, title: '', on: true, typed: false })))
  const [drafting, setDrafting] = useState(seed.mode === 'batch' && seed.draft)
  const [note, setNote] = useState(seed.note)
  const saving = useRef(false), alive = useRef(true)
  const pendingDraft = useRef<ReturnType<typeof requestDraft> | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const calendar = snapshot.workspace.calendar!
  const where = planningLabel(seed.period, calendar, snapshot.observedAt)
  const target = { period: { kind: 'date' as const, startDate: seed.period.startDate } }

  useEffect(() => {
    if (seed.mode !== 'batch' || !seed.draft) return
    let active = true
    const siblings = (id: string) => snapshot.relations.filter(edge => edge.parentId === id).map(edge => snapshot.items.find(item => item.id === edge.childId)?.title).filter((value): value is string => !!value).slice(0, 20)
    const root = (item: ItemSummary) => flows.of(item.id).find(flow => flow.id !== item.id)?.title ?? null
    // StrictMode replays this effect; reuse the request while subscribing only the current effect to its result.
    pendingDraft.current ??= requestDraft({ generation: snapshot.workspace.generation, board: boardDigest(snapshot, flows), tasks: seed.parents.map(parent => ({
      id: parent.id, parent: parent.title, goal: root(parent), target: periodText(seed.period, seed.next), targetHorizon: seed.horizon, siblings: siblings(parent.id) })) })
    void pendingDraft.current.then(result => {
      if (!active) return
      setDrafting(false)
      if (!result.ok) { setNote(result.failure ? t.seedDraftFailed(result.failure.message) : t.generateFailed); return }
      const titles = new Map(result.value.map(value => [value.id, value.title]))
      setRows(previous => previous.map(row => row.typed ? row : { ...row, title: titles.get(row.parent.id) ?? row.title }))
    })
    return () => { active = false }
  }, [])

  const chosen = rows.filter(row => row.on && row.title.trim())
  const ready = seed.mode === 'batch' ? chosen.length > 0 && !drafting : !!text.trim()
  const run = async () => {
    if (!ready || busy || saving.current) return
    saving.current = true
    try {
      const title = text.trim()
      const action: Action = seed.mode === 'batch'
        ? { type: 'createPlan', items: chosen.map((row, index) => ({ draftId: `seed-${index}`, title: row.title.trim(), description: '', dueDate: null, horizon: seed.horizon, previewPeriodId: seed.period.id, flowColor: null, ...target,
          parentRefs: [{ kind: 'existing' as const, itemId: row.parent.id, expectedVersion: row.parent.version }] })) }
        : { type: 'create', title, description: '', dueDate: null, horizon: seed.horizon, ...target, parentId: seed.parent?.id ?? null, expectedParentVersion: seed.parent?.version ?? null, flowColor: null }
      if (!await submit(action)) return
      seed.onCreated?.(title)
      if (alive.current) close()
    } finally { saving.current = false }
  }
  const keys = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void run() }
  }
  const label = seed.mode === 'batch' ? t.seedCreateCount(chosen.length) : t.seedCreate
  const primary = <button type="button" className="composer-primary shrink-0 inline-flex items-center gap-2 h-7.5 pt-0 pr-2 pb-0 pl-3 rounded-[8px] bg-foreground text-surface text-[13px] font-semibold" disabled={busy || !ready} onClick={() => void run()}>{label}<kbd className="keycap">{formatCombo('Enter')}</kbd></button>
  const whereText = seed.parent ? t.seedWhereParent(where, seed.parent.title) : t.seedWhere(where)
  const chip = (text: string, key: string) => <span key={key} className="seed-chip inline-flex items-center h-6 max-w-80 px-2 py-0 rounded-[6px] bg-hover text-[12px] text-soft whitespace-nowrap overflow-hidden text-ellipsis">{text}</span>
  return <Modal title={smartMessages.composer} close={close} className="palette composer-modal seeded-composer"
    heading={<div className="palette-search composer-search">
      <Icon name="add" size={18} />
      {seed.mode === 'batch' ? <span className="composer-input seed-heading flex-1 min-w-0 w-auto min-h-6 max-h-42 p-0 text-[15px] leading-[24px] text-soft">{t.emptyDraft[seed.horizon]}</span>
        : <textarea className="composer-input flex-1 min-w-0 w-auto min-h-6 max-h-42 p-0 text-[15px] leading-[24px] text-foreground" aria-label={smartMessages.inputLabel} autoFocus rows={1} maxLength={500} value={text} onChange={event => setText(event.target.value)} onKeyDown={keys}
          placeholder={seed.parent ? t.seedPlaceholder : t.seedFreePlaceholder} />}
    </div>}>
    <div className="composer-body flex flex-col gap-1.5">
      <div className="seed-chips flex flex-wrap gap-1.5 pt-0 pr-2 pb-0.5 pl-9">
        {seed.parent && chip(t.seedParent(seed.parent.title), 'parent')}
        {chip(where, 'period')}
      </div>
      {(error || note) && <p className="inline-error composer-error mt-0.5 mr-2.5 mb-0 ml-2.5" role="alert">{error ?? note}</p>}
      <section className="composer-cand flex flex-col gap-2.5 pt-3 pr-3 pb-2.5 pl-3.5 rounded-[10px]" data-tone={seed.mode === 'batch' ? 'jev' : 'plain'} aria-live="polite">
        {seed.mode === 'batch' ? <div className="seed-list flex flex-col gap-0.5" role="group" aria-label={t.seedBatchHint} onKeyDown={keys}>
          {rows.map((row, index) => <div key={row.parent.id} className="seed-row flex items-center gap-2.5 min-h-8.5" data-on={row.on}>
            <input type="checkbox" aria-label={t.seedInclude(row.title || row.parent.title)} checked={row.on} onChange={event => setRows(previous => previous.map((value, at) => at === index ? { ...value, on: event.target.checked } : value))} />
            <input className="seed-title flex-1 min-w-0 h-7.5 px-2 py-0 rounded-[6px] text-[14px] text-foreground" aria-label={t.seedParent(row.parent.title)} value={row.title} placeholder={drafting ? t.seedBatchPending : t.seedPlaceholder} maxLength={500} autoFocus={index === 0}
              onChange={event => setRows(previous => previous.map((value, at) => at === index ? { ...value, title: event.target.value, typed: true } : value))} />
            <span className="seed-parent shrink-0 max-w-[40%] text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{t.seedParent(row.parent.title)}</span>
          </div>)}
        </div> : <div className="cand-line flex items-start gap-2.5 min-h-7.5 text-[14px] leading-[22px]"><span className="cand-text flex-1 min-w-0 pt-1">{whereText}</span>{primary}</div>}
        {seed.mode === 'batch' && <div className="cand-hints flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12px] text-muted-foreground"><span>{drafting ? t.seedBatchPending : t.seedBatchHint}</span><span className="column-spacer" />{primary}</div>}
      </section>
    </div>
  </Modal>
}
