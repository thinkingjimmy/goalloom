/**
 * [INPUT]: Editable draft, peer drafts, parent metadata, periods, flows, selection/menu/editing state and change callbacks.
 * [OUTPUT]: One adjust-mode row: a single line (title + where) that, when selected, shows inline T/D/P tokens (column, deadline, parent) opening keyboard menus, an M token for an uncertain split, and E-mode title/description editing. Jev's values and doubts carry the Jev mark.
 * [POS]: Composer adjust list row; Composer owns selection and letter shortcuts, transaction validation stays authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { ItemSummary, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import type { ParentKey } from '../../../shared/contracts/smart-input'
import { horizonNames, messages, smartMessages as t } from '../../i18n'
import { relationColors } from '../../lib/colors'
import { longDate, shortDate } from '../../i18n/format'
import { desktopApi } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import { dueOptions } from '../items/DuePicker'
import { sameParent, type EditableDraft, type Field, type ParentInfo } from './draft'
import { KeyMenu } from './KeyMenu'
import { column, JevBadge, where } from './Plan'
import { doubts, linkParent, parentTitle } from './suggestions'

export type RowMenu = 'horizon' | 'due' | 'parent'
interface Props {
  draft: EditableDraft; drafts: EditableDraft[]; parents: Map<string, ParentInfo>; flows: Flows; usedColors: number[]
  periods: PlanningPeriod[]; today: string; disabled: boolean
  selected: boolean; menu: RowMenu | null; editing: boolean
  select: () => void; openMenu: (menu: RowMenu | null) => void; stopEditing: () => void
  change: (patch: Partial<EditableDraft>, ...fields: Field[]) => void; replace: (next: EditableDraft) => void; remember: (info: ParentInfo) => void; merge: () => void
}

export function DraftRow({ draft, drafts, parents, flows, usedColors, periods, today, disabled, selected, menu, editing, select, openMenu, stopEditing, change, replace, remember, merge }: Props) {
  const indent = draft.parents.some(key => key.kind === 'draft')
  const title = draft.title || t.titleRequired
  if (!selected) return <button type="button" role="option" aria-selected="false" tabIndex={-1} className="plan-row" data-indent={indent} data-orphan={draft.orphan} onClick={select}>
    <span className="plan-title">{title}</span><span className="plan-where">{where(draft, drafts, parents)}</span>
  </button>

  const list = doubts(draft, drafts, parents)
  const doubtOf = (kind: 'horizon' | 'due' | 'parent' | 'role') => list.some(row => row.kind === kind)
  const fromJev = (field: Field) => !draft.manual.includes(field)
  const close = () => openMenu(null)
  const toggle = (next: RowMenu) => openMenu(menu === next ? null : next)
  const labels = draft.parents.map(key => parentTitle(key, drafts, parents))
  const token = (key: string, kind: RowMenu, label: ReactNode, empty: boolean, jev: boolean) =>
    <button type="button" className="plan-token" data-empty={empty} data-doubt={doubtOf(kind)} aria-expanded={menu === kind} aria-keyshortcuts={key} disabled={disabled} onClick={() => toggle(kind)}>
      <kbd className="plan-key">{key}</kbd>{label}{jev && <span className="plan-jev" aria-label={t.fromJev}><Icon name="smart" size={12} /></span>}
    </button>

  return <div className="plan-row" data-selected="true" data-indent={indent} data-orphan={draft.orphan}>
    {editing ? <EditFields draft={draft} disabled={disabled} change={change} done={stopEditing} /> : <>
      <button type="button" role="option" aria-selected="true" className="plan-title plan-focus" onClick={() => openMenu(null)}>{title}</button>
      <span className="plan-tokens">
        {doubtOf('role') && <button type="button" className="plan-token" data-doubt="true" aria-keyshortcuts="M" disabled={disabled} onClick={merge}><kbd className="plan-key">M</kbd>{t.mergeShort}</button>}
        <Popover open={menu === 'horizon'} onClose={close} align="end" anchor={token('T', 'horizon', column(draft.horizon), false, fromJev('horizon') && draft.horizon !== 'later')}>
          <HorizonMenu draft={draft} periods={periods} pick={horizon => { change({ horizon, horizonSuggestion: null, horizonInferred: false }, 'horizon'); close() }} />
        </Popover>
        <Popover open={menu === 'due'} onClose={close} align="end" anchor={token('D', 'due', draft.due ? shortDate(draft.due) : t.dueToken, !draft.due, fromJev('due') && !!draft.due)}>
          <DueMenu draft={draft} today={today} pick={due => { change({ due, dueSuggestion: null }, 'due'); close() }} />
        </Popover>
        <Popover open={menu === 'parent'} onClose={close} align="end" anchor={token('P', 'parent', labels.length ? `↑ ${labels.join(t.comma)}` : t.parentToken, !labels.length, fromJev('parents') && labels.length > 0)}>
          <ParentMenu draft={draft} drafts={drafts} parents={parents} flows={flows} usedColors={usedColors} disabled={disabled} close={close}
            link={(key, info) => { if (info) remember(info); const next = linkParent(draft, key, drafts, parents); if (next && next !== draft) replace(next); close() }}
            change={change} />
        </Popover>
      </span>
    </>}
  </div>
}

function HorizonMenu({ draft, periods, pick }: { draft: EditableDraft; periods: PlanningPeriod[]; pick: (horizon: ItemHorizon) => void }) {
  const range = (horizon: ItemHorizon) => {
    const period = periods.find(row => row.horizon === horizon)
    if (!period) return t.unscheduled
    const end = new Date(`${period.endDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
    return horizon === 'day' ? longDate(period.startDate) : `${shortDate(period.startDate)} – ${shortDate(end.toISOString().slice(0, 10))}`
  }
  return <KeyMenu label={t.horizonLabel}>
    {[...horizons].reverse().map((horizon, index) => <button key={horizon} type="button" role="menuitemradio" aria-checked={draft.horizon === horizon} data-key={index + 1} className="menu-item" onClick={() => pick(horizon)}>
      <kbd className="plan-key">{index + 1}</kbd><span className="menu-text">{column(horizon)}</span>
      {draft.horizonSuggestion === horizon && <JevBadge />}
      <span className="menu-hint">{range(horizon)}</span>
    </button>)}
  </KeyMenu>
}

function DueMenu({ draft, today, pick }: { draft: EditableDraft; today: string; pick: (due: string | null) => void }) {
  const options = dueOptions(today)
  const offset = draft.dueSuggestion ? 1 : 0
  return <KeyMenu label={messages.dueDate}>
    {draft.dueSuggestion && <button type="button" role="menuitemradio" aria-checked={false} data-key="1" className="menu-item" onClick={() => pick(draft.dueSuggestion)}>
      <kbd className="plan-key">1</kbd><span className="menu-text">{longDate(draft.dueSuggestion)}</span><JevBadge />
    </button>}
    {options.map(([label, date], index) => <button key={label} type="button" role="menuitemradio" aria-checked={draft.due === date} data-key={index + 1 + offset} className="menu-item" onClick={() => pick(date)}>
      <kbd className="plan-key">{index + 1 + offset}</kbd><span className="menu-text">{label}</span><span className="menu-hint tabular">{longDate(date)}</span>
    </button>)}
    <div className="menu-separator" />
    <label className="menu-field">{messages.pickDate}<input type="date" value={draft.due ?? ''} onChange={event => { if (event.target.value) pick(event.target.value) }} /></label>
    {draft.due && <button type="button" role="menuitem" className="menu-item danger" onClick={() => pick(null)}>{messages.clearDue}</button>}
  </KeyMenu>
}

function ParentMenu({ draft, drafts, parents, flows, usedColors, disabled, close, link, change }: {
  draft: EditableDraft; drafts: EditableDraft[]; parents: Map<string, ParentInfo>; flows: Flows; usedColors: number[]; disabled: boolean
  close: () => void; link: (key: ParentKey, info: ParentInfo | null) => void; change: (patch: Partial<EditableDraft>, ...fields: Field[]) => void
}) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<ItemSummary[]>([])
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 12 }).then(page => { if (active) setResults(page.items) }).catch(() => undefined), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const chosen = (key: ParentKey) => draft.parents.some(row => sameParent(row, key))
  const suggested = doubts(draft, drafts, parents).flatMap(row => row.kind === 'parent' ? [row] : [])
  const offered = (key: ParentKey) => chosen(key) || suggested.some(row => sameParent(row.key, key))
  const others = drafts.filter(row => row.id !== draft.id && !offered({ kind: 'draft', draftId: row.id }))
  const known = [...parents.values()].filter(info => !offered({ kind: 'existing', itemId: info.itemId }))
  const found = results.filter(item => !chosen({ kind: 'existing', itemId: item.id }) && item.status !== 'cancelled')
  const info = (item: ItemSummary): ParentInfo => ({ itemId: item.id, title: item.title, version: item.version, archived: item.archivedAt !== null, flowColor: item.flowColor, horizon: item.placement.horizon })
  const colorsOf = (key: ParentKey) => key.kind === 'existing' ? (parents.get(key.itemId)?.flowColor ?? null) !== null ? [parents.get(key.itemId)!.flowColor!] : flows.colorsOf(key.itemId) : []
  const blocked = draft.flowColor !== null
  const free = relationColors.map((_, index) => index).filter(index => !usedColors.includes(index) || draft.flowColor === index)
  const takenByDraft = drafts.filter(row => row.id !== draft.id).map(row => row.flowColor).filter(value => value !== null)
  return <KeyMenu label={t.parentToken}>
    <input className="menu-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.searchParents} aria-label={t.searchParents} disabled={blocked} />
    {blocked && <p className="menu-note">{t.parentBlockedByFlow}</p>}
    {!blocked && (query.trim() ? found.map(item => <button key={item.id} type="button" className="menu-item" onClick={() => link({ kind: 'existing', itemId: item.id }, info(item))}>
      <FlowMark colors={item.flowColor !== null ? [item.flowColor] : flows.colorsOf(item.id)} /><span className="menu-text">{item.title}</span><span className="menu-hint">{item.archivedAt ? t.archivedTag : horizonNames[item.placement.horizon]}</span>
    </button>) : <>
      {suggested.map(row => <button key={`jev-${row.key.kind === 'existing' ? row.key.itemId : row.key.draftId}`} type="button" className="menu-item" onClick={() => link(row.key, null)}>
        <FlowMark colors={colorsOf(row.key)} /><span className="menu-text">{row.title}</span><JevBadge />{row.move && <span className="menu-hint">{t.movesTo(horizonNames[row.move])}</span>}
      </button>)}
      {draft.parents.map(key => <button key={`on-${key.kind === 'existing' ? key.itemId : key.draftId}`} type="button" className="menu-item" aria-label={t.removeParent(parentTitle(key, drafts, parents))} onClick={() => change({ parents: draft.parents.filter(row => !sameParent(row, key)) }, 'parents')}>
        <Icon name="check" size={14} /><span className="menu-text">{parentTitle(key, drafts, parents)}</span><span className="menu-hint">{t.removeShort}</span>
      </button>)}
      {others.length > 0 && <p className="menu-heading">{t.batchDrafts}</p>}
      {others.map(row => <button key={row.id} type="button" className="menu-item" onClick={() => link({ kind: 'draft', draftId: row.id }, null)}><FlowMark colors={row.flowColor !== null ? [row.flowColor] : []} /><span className="menu-text">{row.title}</span></button>)}
      {known.length > 0 && <p className="menu-heading">{t.candidates}</p>}
      {known.map(row => <button key={row.itemId} type="button" className="menu-item" onClick={() => link({ kind: 'existing', itemId: row.itemId }, null)}><FlowMark colors={row.flowColor !== null ? [row.flowColor] : flows.colorsOf(row.itemId)} /><span className="menu-text">{row.title}</span><span className="menu-hint">{row.archived ? t.archivedTag : horizonNames[row.horizon]}</span></button>)}
    </>)}
    {!draft.parents.length && <>
      <div className="menu-separator" />
      <p className="menu-heading">{t.newFlow}</p>
      <div className="swatches" role="radiogroup" aria-label={t.newFlowHint}>
        <button type="button" role="radio" aria-checked={draft.flowColor === null} aria-label={t.noColor} title={t.noColor} className="swatch" onClick={() => { change({ flowColor: null }, 'flowColor'); close() }}><FlowMark colors={[]} dashed /></button>
        {free.map(index => <button key={index} type="button" role="radio" aria-checked={draft.flowColor === index} aria-label={messages.colorNames[index]!} title={messages.colorNames[index]!} className="swatch" disabled={disabled || takenByDraft.includes(index) || draft.horizon === 'later'} onClick={() => { change({ flowColor: index }, 'flowColor'); close() }}><FlowMark colors={[index]} /></button>)}
      </div>
      {!free.length && <p className="menu-note">{t.noFreeColor}</p>}
    </>}
  </KeyMenu>
}

// E: title and description in place; Enter in the title or Esc returns to the row.
function EditFields({ draft, disabled, change, done }: { draft: EditableDraft; disabled: boolean; change: Props['change']; done: () => void }) {
  const keys = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target instanceof HTMLInputElement)) { event.preventDefault(); done() }
  }
  return <div className="plan-edit" onKeyDown={keys}>
    <input className="plan-edit-title" aria-label={t.titleLabel} value={draft.title} maxLength={500} disabled={disabled} autoFocus onChange={event => change({ title: event.target.value }, 'title')} />
    <textarea className="plan-edit-note" aria-label={t.descriptionLabel} placeholder={t.addDescription} value={draft.description} rows={2} disabled={disabled} onChange={event => change({ description: event.target.value }, 'description')} />
  </div>
}
