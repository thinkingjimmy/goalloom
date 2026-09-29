/**
 * [INPUT]: One board item, flow/topology/candidate views, guarded actions, RelationDragContext and the board's preview callback.
 * [OUTPUT]: Role-aware flow menus, pointer linking and keyboard adoption for roots; hover/focus previews stay active across flow rows and breakpoint controls.
 * [POS]: board row decoration; writes only through flowColor/link/unlink actions, so undo toasts and revalidation stay authoritative.
 *        Later items render nothing: the parking lot takes no part in flows or links.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useContext, useMemo, useRef, useState, type CSSProperties } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { mayParent } from '../../../domain/relations'
import { horizonNames, messages } from '../../i18n'
import { flowRing } from '../../lib/colors'
import type { Flows } from '../../state/flows'
import type { Action } from '../../state/use-workspace'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { FlowColorMenu } from '../items/FlowPicker'
import { RelationPicker } from '../items/RelationPicker'
import { RelationDragContext } from './RelationDrag'

type Mode = 'color' | 'relation' | 'choose'

export function FlowDot({ item, flows, relations, candidates, disabled, submit, onPreview }: {
  item: ItemSummary; flows: Flows; relations: Snapshot['relations']; candidates: ItemSummary[]
  disabled: boolean; submit: (action: Action) => Promise<unknown>; onPreview: (itemId: string | null) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [error, setError] = useState('')
  const linking = useContext(RelationDragContext)
  const trigger = useRef<HTMLButtonElement>(null)
  const open = mode !== null
  const hasParents = relations.some(edge => edge.childId === item.id)
  const role = hasParents ? 'child' : item.flowColor !== null ? 'root' : 'loose'
  // Descendants reached by a root's colour change, counted only while its menu is open.
  const impact = useMemo(() => {
    if (mode !== 'color') return 0
    const seen = new Set<string>(), pending = [item.id]
    while (pending.length) {
      const id = pending.pop()!
      for (const edge of relations) if (edge.parentId === id && !seen.has(edge.childId)) { seen.add(edge.childId); pending.push(edge.childId) }
    }
    return seen.size
  }, [mode, item.id, relations])
  if (item.placement.horizon === 'later') return null

  const member = flows.of(item.id), colors = member.map(flow => flow.flowColor)
  const names = member.map(flow => flow.title).join(messages.listJoin)
  const label = role === 'root' ? messages.labelled(messages.flowColor, messages.colorNames[item.flowColor!]!)
    : role === 'child' ? (names ? messages.labelled(messages.parentsAndFlow, names) : messages.parentsAndFlow) : messages.joinFlow
  const topmost = !horizons.some(horizon => mayParent(horizon, item.placement.horizon))
  const close = () => { setMode(null); setError('') }
  // Board owns leaving the preview, so the pointer can cross this row to its trailing add button.
  const preview = () => { if (colors.length) onPreview(item.id) }
  const chooseColor = (index: number | null) => {
    close()
    if (index !== item.flowColor) void submit({ type: 'flowColor', itemId: item.id, expectedVersion: item.version, flowColor: index })
  }
  return <div className="flow-dot-slot">
    <Popover floating open={open} onClose={close} anchor={
      <button ref={trigger} type="button" className="flow-dot-button" data-role={role} aria-haspopup="dialog" aria-expanded={open} aria-label={label} disabled={disabled}
        aria-description={!topmost ? messages.dragRelationHint : undefined} title={`${colors.length > 2 ? `${label} · ${messages.multiFlow(colors.length)}` : label}${topmost ? '' : ` · ${messages.dragRelationHint}`}`}
        onPointerDown={event => { event.stopPropagation(); if (!disabled) linking?.begin(event, item, close) }} onClick={() => open ? close() : setMode(role === 'root' ? 'color' : role === 'child' ? 'relation' : 'choose')}
        onPointerEnter={preview} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) preview() }}>
        {colors.length > 2 ? <span className="flow-dot-count">{colors.length}</span>
          : <span className="flow-dot" data-empty={!colors.length} style={colors.length ? { '--flow-ring': flowRing(colors) } as CSSProperties : undefined} />}
        {role === 'loose' && <Icon name="add" size={12} strokeWidth={2} />}
      </button>
    }>
      {mode === 'color' && <><FlowColorMenu itemId={item.id} color={item.flowColor} flows={flows} busy={disabled} impact={impact} onChoose={chooseColor} />
        {role === 'root' && !topmost && linking && <div className="flow-adoption-entry"><button type="button" role="menuitem" className="menu-item" disabled={disabled} onClick={() => setMode('relation')}>
          <Icon name="link" size={14} /><span className="menu-rich"><span>{messages.linkToParent}</span><small>{messages.adoptParentFlowHint}</small></span>
        </button></div>}
      </>}
      {mode === 'relation' && <div className="flow-dot-relations">
        <RelationPicker side="parent" self={{ id: item.id, horizon: item.placement.horizon }} edges={relations} flows={flows} candidates={candidates} submit={submit} onError={setError}
          linkParent={linking ? async parent => { const saved = await linking.connect(parent, item); if (saved && role === 'root') { close(); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) } } : undefined}
          note={role === 'root' ? <span>{messages.adoptParentFlowHint}</span> : <span className="flow-dot-owners">{messages.flowFromParents}{member.length ? member.map(flow => <span key={flow.id}><span className="flow-dot" style={{ '--flow-ring': flowRing([flow.flowColor]) } as CSSProperties} />{flow.title}</span>) : <span>{messages.flowUnset}</span>}</span>} />
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>}
      {mode === 'choose' && <div className="menu flow-choose" role="menu" aria-label={messages.joinFlow}>
        <button type="button" role="menuitem" className="menu-item" onClick={() => setMode('color')}>
          <span className="flow-dot" data-empty="true" />
          <span className="menu-rich"><span>{messages.startFlow}</span><small>{messages.startFlowHint}</small></span>
        </button>
        <button type="button" role="menuitem" className="menu-item" disabled={topmost} onClick={() => setMode('relation')}>
          <Icon name="link" size={14} />
          <span className="menu-rich"><span>{messages.linkToParent}</span><small>{topmost ? messages.noLongerHorizon(horizonNames[item.placement.horizon]) : messages.linkToParentHint}</small></span>
        </button>
      </div>}
    </Popover>
  </div>
}
