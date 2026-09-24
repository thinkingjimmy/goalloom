/**
 * [INPUT]: Editable draft, peer drafts, parent metadata, periods and change callbacks.
 * [OUTPUT]: Manual-priority title, description, schedule, due date, parent and flow controls.
 * [POS]: One composer preview row; transaction validation remains authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import { horizons, type ItemSummary, type ItemHorizon, type PlanningPeriod } from '../../../shared/contracts/entities'
import type { ParentKey } from '../../../shared/contracts/smart-input'
import { horizonNames, messages, smartMessages as t } from '../../i18n'
import { relationColors } from '../../lib/colors'
import { longDate, shortDate } from '../../i18n/format'
import { desktopApi } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import { DuePicker } from '../items/DuePicker'
import { sameParent, type EditableDraft, type Field, type ParentInfo } from './draft'

interface Props {
  draft: EditableDraft; drafts: EditableDraft[]; parents: Map<string, ParentInfo>; flows: Flows; usedColors: number[]
  periods: PlanningPeriod[]; today: string; disabled: boolean
  change: (patch: Partial<EditableDraft>, field: Field) => void; remember: (info: ParentInfo) => void; remove: () => void
}
export function DraftCard({ draft, drafts, parents, flows, usedColors, periods, today, disabled, change, remember, remove }: Props) {
  const [picking, setPicking] = useState(false), [editing, setEditing] = useState(false)
  const range = (horizon: ItemHorizon) => {
    const period = periods.find(row => row.horizon === horizon)
    if (!period) return t.laterUnscheduled
    const end = new Date(`${period.endDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
    return horizon === 'day' ? longDate(period.startDate) : `${shortDate(period.startDate)} – ${shortDate(end.toISOString().slice(0, 10))}`
  }
  const label = (key: ParentKey) => key.kind === 'existing' ? parents.get(key.itemId)?.title ?? '' : drafts.find(row => row.id === key.draftId)?.title ?? ''
  const colorsOf = (key: ParentKey): number[] => {
    if (key.kind === 'existing') { const info = parents.get(key.itemId); return info?.flowColor !== null && info?.flowColor !== undefined ? [info.flowColor] : flows.colorsOf(key.itemId) }
    const parent = drafts.find(row => row.id === key.draftId)
    return parent?.flowColor !== null && parent?.flowColor !== undefined ? [parent.flowColor] : []
  }
  const addParent = (key: ParentKey) => { if (!draft.parents.some(row => sameParent(row, key))) change({ parents: [...draft.parents, key], parentSuggestions: draft.parentSuggestions.filter(row => !sameParent(row, key)) }, 'parents'); setPicking(false) }
  const free = relationColors.map((_, index) => index).filter(index => !usedColors.includes(index) || draft.flowColor === index)
  const takenByDraft = drafts.filter(row => row.id !== draft.id).map(row => row.flowColor).filter(value => value !== null)
  return <article className="draft-card" data-orphan={draft.orphan}>
    <div className="draft-head">
      <input className="draft-title" aria-label={t.titleLabel} value={draft.title} maxLength={500} disabled={disabled} onChange={event => change({ title: event.target.value }, 'title')} />
      {!draft.roleCertain && <span className="draft-badge">{t.uncertain}</span>}
      <button type="button" className="icon-button small" aria-label={t.removeDraft(draft.title)} disabled={disabled} onClick={remove}><Icon name="close" size={14} /></button>
    </div>
    {editing
      ? <textarea className="draft-description" aria-label={t.descriptionLabel} value={draft.description} rows={3} autoFocus onBlur={() => setEditing(false)} onChange={event => change({ description: event.target.value }, 'description')} />
      : draft.description && <button type="button" className="draft-note" title={t.editDescription} onClick={() => setEditing(true)}>{draft.description}</button>}
    <div className="draft-fields">
      <label className="draft-field"><span className="sr-only">{t.horizonLabel}</span>
        <select value={draft.horizon} disabled={disabled} onChange={event => change({ horizon: event.target.value as ItemHorizon, horizonSuggestion: null }, 'horizon')}>
          {[...horizons].reverse().map(horizon => <option key={horizon} value={horizon}>{horizon === 'later' ? t.laterUnscheduled : `${horizonNames[horizon]} · ${range(horizon)}`}</option>)}
        </select>
      </label>
      <DuePicker value={draft.due ?? ''} today={today} readOnly={disabled} onChange={value => change({ due: value || null, dueSuggestion: null }, 'due')} />
      {draft.horizonSuggestion && <button type="button" className="suggestion" onClick={() => change({ horizon: draft.horizonSuggestion!, horizonSuggestion: null }, 'horizon')}>{t.suggestHorizon(horizonNames[draft.horizonSuggestion])}</button>}
      {draft.dueSuggestion && <button type="button" className="suggestion" onClick={() => change({ due: draft.dueSuggestion, dueSuggestion: null }, 'due')}>{t.suggestDue(longDate(draft.dueSuggestion))}</button>}
    </div>
    <div className="draft-parents" aria-label={t.parentsLabel}>
      {draft.parents.map(key => <span key={key.kind === 'existing' ? key.itemId : key.draftId} className="parent-chip">
        <FlowMark colors={colorsOf(key)} /><span className="chip-text">{label(key)}{key.kind === 'existing' && parents.get(key.itemId)?.archived ? ` · ${t.archivedTag}` : ''}</span>
        <button type="button" aria-label={t.removeParent(label(key))} disabled={disabled} onClick={() => change({ parents: draft.parents.filter(row => !sameParent(row, key)) }, 'parents')}><Icon name="close" size={12} /></button>
      </span>)}
      {draft.parentSuggestions.map(key => <button key={`s-${key.kind === 'existing' ? key.itemId : key.draftId}`} type="button" className="suggestion" disabled={disabled || draft.flowColor !== null} onClick={() => addParent(key)}>{t.suggestParent(label(key))}</button>)}
      <Popover open={picking} onClose={() => setPicking(false)} anchor={
        <button type="button" className="text-button small" disabled={disabled || draft.flowColor !== null} title={draft.flowColor !== null ? t.parentBlockedByFlow : undefined} aria-expanded={picking} onClick={() => setPicking(!picking)}>＋ {t.addParent}</button>
      }>
        <ParentMenu draft={draft} drafts={drafts} parents={parents} flows={flows} pick={(key, info) => { if (info) remember(info); addParent(key) }} />
      </Popover>
    </div>
    <div className="draft-flow">
      {draft.parents.length > 0
        ? <small className="muted">{draft.flowColor === null ? t.flowBlockedByParent : t.parentBlockedByFlow}</small>
        : <>
          <label className="check-label"><input type="checkbox" checked={draft.flowColor !== null} disabled={disabled || (!free.some(index => !takenByDraft.includes(index)) && draft.flowColor === null)}
            onChange={event => change({ flowColor: event.target.checked ? free.find(index => !takenByDraft.includes(index)) ?? null : null }, 'flowColor')} />{t.newFlow}</label>
          {draft.flowColor !== null && <div className="swatches" role="radiogroup" aria-label={t.newFlowHint}>
            {free.map(index => <button key={index} type="button" role="radio" aria-checked={draft.flowColor === index} aria-label={messages.colorNames[index]!} title={messages.colorNames[index]!} className="swatch" disabled={disabled || takenByDraft.includes(index)} onClick={() => change({ flowColor: index }, 'flowColor')}><FlowMark colors={[index]} /></button>)}
          </div>}
          {!free.length && draft.flowColor === null && <small className="muted">{t.noFreeColor}</small>}
        </>}
    </div>
  </article>
}

function ParentMenu({ draft, drafts, parents, flows, pick }: { draft: EditableDraft; drafts: EditableDraft[]; parents: Map<string, ParentInfo>; flows: Flows; pick: (key: ParentKey, info: ParentInfo | null) => void }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<ItemSummary[]>([])
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 12 }).then(page => { if (active) setResults(page.items) }).catch(() => undefined), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const chosen = (key: ParentKey) => draft.parents.some(row => sameParent(row, key))
  const others = drafts.filter(row => row.id !== draft.id && !chosen({ kind: 'draft', draftId: row.id }))
  const known = [...parents.values()].filter(info => !chosen({ kind: 'existing', itemId: info.itemId }))
  const found = results.filter(item => !chosen({ kind: 'existing', itemId: item.id }) && item.status !== 'cancelled')
  const info = (item: ItemSummary): ParentInfo => ({ itemId: item.id, title: item.title, version: item.version, archived: item.archivedAt !== null, flowColor: item.flowColor, horizon: item.placement.horizon })
  return <div className="menu relation-picker" role="dialog" aria-label={t.addParent}>
    <input className="menu-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t.searchParents} aria-label={t.searchParents} />
    {query.trim() ? <>
      {found.map(item => <button key={item.id} type="button" className="menu-item" onClick={() => pick({ kind: 'existing', itemId: item.id }, info(item))}>
        <FlowMark colors={item.flowColor !== null ? [item.flowColor] : flows.colorsOf(item.id)} /><span className="menu-text">{item.title}</span><span className="menu-hint">{item.archivedAt ? t.archivedTag : horizonNames[item.placement.horizon]}</span>
      </button>)}
    </> : <>
      {others.length > 0 && <p className="menu-heading">{t.batchDrafts}</p>}
      {others.map(row => <button key={row.id} type="button" className="menu-item" onClick={() => pick({ kind: 'draft', draftId: row.id }, null)}><FlowMark colors={row.flowColor !== null ? [row.flowColor] : []} /><span className="menu-text">{row.title}</span></button>)}
      {known.length > 0 && <p className="menu-heading">{t.candidates}</p>}
      {known.map(row => <button key={row.itemId} type="button" className="menu-item" onClick={() => pick({ kind: 'existing', itemId: row.itemId }, null)}><FlowMark colors={row.flowColor !== null ? [row.flowColor] : flows.colorsOf(row.itemId)} /><span className="menu-text">{row.title}</span><span className="menu-hint">{row.archived ? t.archivedTag : horizonNames[row.horizon]}</span></button>)}
    </>}
  </div>
}
