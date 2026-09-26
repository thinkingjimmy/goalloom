/**
 * [INPUT]: One board item, stable flow views, snapshot topology and candidates, guarded actions and the board's preview callback.
 * [OUTPUT]: The hover dot left of a row's checkbox. One job per role: a flow root edits its colour, an item with parents edits
 *           its parents (flow follows the links), a loose item chooses between starting a flow and linking to a parent.
 *           Hovering or keyboard-focusing a coloured dot asks the board to preview that item's flows and chain.
 * [POS]: board row decoration; writes only through flowColor/link/unlink actions, so undo toasts and revalidation stay authoritative.
 *        Later items render nothing: the parking lot takes no part in flows or links.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo, useState, type CSSProperties } from 'react'
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

type Mode = 'color' | 'relation' | 'choose'

export function FlowDot({ item, flows, relations, candidates, submit, onPreview }: {
  item: ItemSummary; flows: Flows; relations: Snapshot['relations']; candidates: ItemSummary[]
  submit: (action: Action) => Promise<unknown>; onPreview: (itemId: string | null) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [error, setError] = useState('')
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
  // Pointer hover and keyboard focus preview; a mouse click's focus does not, so a closed menu leaves no lingering preview.
  const preview = () => { if (colors.length) onPreview(item.id) }
  const chooseColor = (index: number | null) => {
    close()
    if (index !== item.flowColor) void submit({ type: 'flowColor', itemId: item.id, expectedVersion: item.version, flowColor: index })
  }
  return <div className="flow-dot-slot">
    <Popover floating open={open} onClose={close} anchor={
      <button type="button" className="flow-dot-button" data-role={role} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={colors.length > 2 ? `${label} · ${messages.multiFlow(colors.length)}` : label}
        onPointerDown={event => event.stopPropagation()} onClick={() => open ? close() : setMode(role === 'root' ? 'color' : role === 'child' ? 'relation' : 'choose')}
        onPointerEnter={preview} onPointerLeave={() => onPreview(null)} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) preview() }} onBlur={() => onPreview(null)}>
        {colors.length > 2 ? <span className="flow-dot-count">{colors.length}</span>
          : <span className="flow-dot" data-empty={!colors.length} style={colors.length ? { '--flow-ring': flowRing(colors) } as CSSProperties : undefined} />}
        {role === 'loose' && <Icon name="add" size={12} strokeWidth={2} />}
      </button>
    }>
      {mode === 'color' && <FlowColorMenu itemId={item.id} color={item.flowColor} flows={flows} busy={false} impact={impact} onChoose={chooseColor} />}
      {mode === 'relation' && <div className="flow-dot-relations">
        <RelationPicker side="parent" self={{ id: item.id, horizon: item.placement.horizon }} edges={relations} flows={flows} candidates={candidates} submit={submit} onError={setError}
          note={<span className="flow-dot-owners">{messages.flowFromParents}{member.length ? member.map(flow => <span key={flow.id}><span className="flow-dot" style={{ '--flow-ring': flowRing([flow.flowColor]) } as CSSProperties} />{flow.title}</span>) : <span>{messages.flowUnset}</span>}</span>} />
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
