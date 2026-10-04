/**
 * [INPUT]: A ComposerSeed (target column/period, parent, bridge children or batch parents), the snapshot/flows for drafting, insight readiness and guarded submission.
 * [OUTPUT]: The ⌘N composer with prefilled context and one title or a checked batch; one draft request per mount, editable fallback on failure and typed-text precedence over late results.
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
  mode: 'next' | 'bridge' | 'batch' | 'free'
  horizon: ChildHorizon
  period: PlanningPeriod
  next: boolean
  parent: ItemSummary | null
  children: ItemSummary[]
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
      id: parent.id, kind: 'next' as const, parent: parent.title, goal: root(parent), target: periodText(seed.period, seed.next), targetHorizon: seed.horizon, siblings: siblings(parent.id), children: [] })) })
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
        : seed.mode === 'bridge'
          ? { type: 'insertBetween', title, horizon: seed.horizon, ...target, parentId: seed.parent!.id, expectedParentVersion: seed.parent!.version, children: seed.children.map(child => ({ itemId: child.id, expectedVersion: child.version })) }
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
  const label = seed.mode === 'batch' ? t.seedCreateCount(chosen.length) : seed.mode === 'bridge' ? t.seedBridge : t.seedCreate
  const primary = <button type="button" className="composer-primary" disabled={busy || !ready} onClick={() => void run()}>{label}<kbd className="keycap">{formatCombo('Enter')}</kbd></button>
  const whereText = seed.mode === 'bridge' ? t.seedBridgeWhere(seed.children.length) : seed.parent ? t.seedWhereParent(where, seed.parent.title) : t.seedWhere(where)
  const chip = (text: string, key: string) => <span key={key} className="seed-chip">{text}</span>
  return <Modal title={smartMessages.composer} close={close} className="palette composer-modal seeded-composer"
    heading={<div className="palette-search composer-search">
      <Icon name="add" size={18} />
      {seed.mode === 'batch' ? <span className="composer-input seed-heading">{t.emptyDraft}</span>
        : <textarea className="composer-input" aria-label={smartMessages.inputLabel} autoFocus rows={1} maxLength={500} value={text} onChange={event => setText(event.target.value)} onKeyDown={keys}
          placeholder={seed.mode === 'bridge' ? t.seedBridgePlaceholder : seed.parent ? t.seedPlaceholder : t.seedFreePlaceholder} />}
    </div>}>
    <div className="composer-body">
      <div className="seed-chips">
        {seed.parent && chip(t.seedParent(seed.parent.title), 'parent')}
        {chip(where, 'period')}
        {seed.mode === 'bridge' && chip(t.seedChildren(seed.children.length), 'children')}
      </div>
      {(error || note) && <p className="inline-error composer-error" role="alert">{error ?? note}</p>}
      <section className="composer-cand" data-tone={seed.mode === 'batch' ? 'jev' : 'plain'} aria-live="polite">
        {seed.mode === 'batch' ? <div className="seed-list" role="group" aria-label={t.seedBatchHint} onKeyDown={keys}>
          {rows.map((row, index) => <div key={row.parent.id} className="seed-row" data-on={row.on}>
            <input type="checkbox" aria-label={t.seedInclude(row.title || row.parent.title)} checked={row.on} onChange={event => setRows(previous => previous.map((value, at) => at === index ? { ...value, on: event.target.checked } : value))} />
            <input className="seed-title" aria-label={t.seedParent(row.parent.title)} value={row.title} placeholder={drafting ? t.seedBatchPending : t.seedPlaceholder} maxLength={500} autoFocus={index === 0}
              onChange={event => setRows(previous => previous.map((value, at) => at === index ? { ...value, title: event.target.value, typed: true } : value))} />
            <span className="seed-parent">{t.seedParent(row.parent.title)}</span>
          </div>)}
        </div> : <div className="cand-line"><span className="cand-text">{whereText}</span>{primary}</div>}
        {seed.mode === 'batch' && <div className="cand-hints"><span>{drafting ? t.seedBatchPending : t.seedBatchHint}</span><span className="column-spacer" />{primary}</div>}
      </section>
    </div>
  </Modal>
}
