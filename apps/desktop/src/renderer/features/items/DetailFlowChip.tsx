/**
 * [INPUT]: Item identity, relations, flow colors, eligible candidates and guarded submission.
 * [OUTPUT]: DetailFlowChip: parent selection, root colors, loose flow choices and read-only inherited goal provenance; hidden in Later.
 * [POS]: Detail property control matching the board flow dot. RelationPicker and flowColor transactions validate writes.
 */
import { menuStyles } from '../../components/ui/menu'
import { cn } from '../../lib/utils'
import { nestingText } from '../../../shared/i18n/nesting'
import { useMemo, useState } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { Item, ItemSummary } from '../../../shared/contracts/entities'
import type { ItemDetail } from '../../../shared/contracts/queries'
import { mayParent } from '../../../domain/relations'
import { horizonNames, messages } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { FlowColorMenu, FlowDot } from './FlowPicker'
import { RelationPicker } from './RelationPicker'

type Mode = 'color' | 'relation' | 'choose' | 'inherited'

export function DetailFlowChip({ item, edges, flows, candidates, busy, readOnly, submit, onError }: {
  item: Item; edges: ItemDetail['relations']; flows: Flows; candidates: ItemSummary[]
  busy: boolean; readOnly: boolean; submit: (action: Action) => Promise<unknown>; onError: (message: string) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null), [error, setError] = useState('')
  const parents = edges.filter(edge => edge.childId === item.id)
  const later = item.placement.horizon === 'later'
  const role = parents.length > 0 || !!item.placement.nestingParentId ? 'child' : item.flowColor !== null ? 'root' : 'loose'
  const topmost = !horizons.some(horizon => mayParent(horizon, item.placement.horizon))
  const colors = flows.colorsOf(item.id)
  const impact = useMemo(() => {
    if (mode !== 'color') return 0
    if (flows.descendantsOf) return flows.descendantsOf(item.id).length
    const seen = new Set<string>(), pending = [item.id]
    while (pending.length) {
      const id = pending.pop()!
      for (const edge of edges) if (edge.parentId === id && !seen.has(edge.childId)) { seen.add(edge.childId); pending.push(edge.childId) }
    }
    return seen.size
  }, [mode, item.id, edges])
  if (later) return null
  const close = () => { setMode(null); setError('') }
  const choose = (index: number | null) => {
    close()
    if (index !== item.flowColor) void submit({ type: 'flowColor', itemId: item.id, expectedVersion: item.version, flowColor: index })
  }
  const names = parents.map(edge => edge.parentTitle).join(messages.listJoin)
  const label = role === 'root'
    ? messages.labelled(messages.flowColor, item.flowColor === null ? messages.flowUnset : messages.colorNames[item.flowColor]!)
    : role === 'child' ? messages.labelled(messages.parents, names || messages.parents) : messages.joinFlow
  return <Popover floating open={mode !== null} onClose={close} anchor={
    <button type="button" className="detail-chip" data-dot={role === 'root'} data-empty={role === 'loose'} aria-haspopup="dialog" aria-expanded={mode !== null} aria-label={label} disabled={readOnly} onClick={() => { if (!busy) setMode(mode ? null : item.placement.nestingParentId ? 'inherited' : role === 'root' ? 'color' : role === 'child' ? 'relation' : 'choose') }}>
      <FlowDot colors={role === 'loose' ? [] : colors} />
      {role === 'child' && <span className="detail-chip-text">{parents[0]?.parentTitle}</span>}
      {role === 'child' && parents.length > 1 && <span className="detail-chip-count">{parents.length}</span>}
      {role === 'loose' && (item.placement.nestingParentId ? nestingText().inherits : messages.joinFlow)}
    </button>
  }>
    {mode === 'inherited' && <div className={cn(menuStyles.surface, 'menu')} role="dialog" aria-label={nestingText().inherits}><p className="menu-note">{nestingText().inherited}</p>{parents.map(parent => <p key={parent.id} className="menu-note">{parent.parentTitle}{parent.parentArchived ? messages.archivedSuffix : ''}</p>)}</div>}
    {mode === 'color' && <FlowColorMenu itemId={item.id} color={item.flowColor} flows={flows} busy={busy} impact={impact} onChoose={choose} extra={role === 'root' && !topmost && <>
      <div className={cn(menuStyles.separator, 'menu-separator')} />
      <button type="button" className={cn(menuStyles.item, 'menu-item')} disabled={busy} onClick={() => setMode('relation')}>
        <Icon name="link" size={14} /><span className="menu-rich"><span>{messages.linkToParent}</span><small>{messages.adoptParentFlowHint}</small></span>
      </button>
    </>} />}
    {mode === 'relation' && <div className="flow-dot-relations">
      <RelationPicker side="parent" self={{ id: item.id, horizon: item.placement.horizon }} edges={edges} flows={flows} candidates={candidates} submit={submit} onError={message => { setError(message); onError(message) }} adoptParentFlow={role === 'root'} note={<span>{messages.flowFromParents}</span>} />
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>}
    {mode === 'choose' && <div className={cn(menuStyles.surface, 'menu flow-choose')} role="menu" aria-label={messages.joinFlow}>
      <button type="button" role="menuitem" className={cn(menuStyles.item, 'menu-item')} onClick={() => setMode('color')}>
        <span className="flow-dot" data-empty="true" />
        <span className="menu-rich"><span>{messages.startFlow}</span></span>
      </button>
      <button type="button" role="menuitem" className={cn(menuStyles.item, 'menu-item')} disabled={topmost || busy} onClick={() => setMode('relation')}>
        <Icon name="link" size={14} />
        <span className="menu-rich"><span>{messages.linkToParent}</span>{topmost && <small>{messages.noLongerHorizon(horizonNames[item.placement.horizon])}</small>}</span>
      </button>
    </div>}
  </Popover>
}
