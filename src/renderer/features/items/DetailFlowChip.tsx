/**
 * [INPUT]: 当前条目、其关联边、流程视图、候选与受限提交。
 * [OUTPUT]: 详情属性行上的一枚流程芯片。有上级时圆点加上级标题，点开上级选择器；流程起点只显示圆点，点开色板；都没有时是「加入流程」。Later 不渲染。
 * [POS]: 详情里对应看板流程圆点的点击菜单；下级和下一步不在这里出现。写入仍由 RelationPicker / flowColor 事务复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
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

type Mode = 'color' | 'relation' | 'choose'

export function DetailFlowChip({ item, edges, flows, candidates, busy, readOnly, submit, onError }: {
  item: Item; edges: ItemDetail['relations']; flows: Flows; candidates: ItemSummary[]
  busy: boolean; readOnly: boolean; submit: (action: Action) => Promise<unknown>; onError: (message: string) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null), [error, setError] = useState('')
  const parents = edges.filter(edge => edge.childId === item.id)
  const later = item.placement.horizon === 'later'
  const role = parents.length > 0 ? 'child' : item.flowColor !== null ? 'root' : 'loose'
  const topmost = !horizons.some(horizon => mayParent(horizon, item.placement.horizon))
  const colors = flows.colorsOf(item.id)
  const impact = useMemo(() => {
    if (mode !== 'color') return 0
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
    <button type="button" className="detail-chip" data-dot={role === 'root'} data-empty={role === 'loose'} aria-haspopup="dialog" aria-expanded={mode !== null} aria-label={label} disabled={readOnly} onClick={() => { if (!busy) setMode(mode ? null : role === 'root' ? 'color' : role === 'child' ? 'relation' : 'choose') }}>
      <FlowDot colors={role === 'loose' ? [] : colors} />
      {role === 'child' && <span className="detail-chip-text">{parents[0]?.parentTitle}</span>}
      {role === 'child' && parents.length > 1 && <span className="detail-chip-count">{parents.length}</span>}
      {role === 'loose' && messages.joinFlow}
    </button>
  }>
    {mode === 'color' && <FlowColorMenu itemId={item.id} color={item.flowColor} flows={flows} busy={busy} impact={impact} onChoose={choose} extra={role === 'root' && !topmost && <>
      <div className="menu-separator" />
      <button type="button" className="menu-item" disabled={busy} onClick={() => setMode('relation')}>
        <Icon name="link" size={14} /><span className="menu-rich"><span>{messages.linkToParent}</span><small>{messages.adoptParentFlowHint}</small></span>
      </button>
    </>} />}
    {mode === 'relation' && <div className="flow-dot-relations">
      <RelationPicker side="parent" self={{ id: item.id, horizon: item.placement.horizon }} edges={edges} flows={flows} candidates={candidates} submit={submit} onError={message => { setError(message); onError(message) }} adoptParentFlow={role === 'root'} note={<span>{messages.flowFromParents}</span>} />
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>}
    {mode === 'choose' && <div className="menu flow-choose" role="menu" aria-label={messages.joinFlow}>
      <button type="button" role="menuitem" className="menu-item" onClick={() => setMode('color')}>
        <span className="flow-dot" data-empty="true" />
        <span className="menu-rich"><span>{messages.startFlow}</span><small>{messages.startFlowHint}</small></span>
      </button>
      <button type="button" role="menuitem" className="menu-item" disabled={topmost || busy} onClick={() => setMode('relation')}>
        <Icon name="link" size={14} />
        <span className="menu-rich"><span>{messages.linkToParent}</span><small>{topmost ? messages.noLongerHorizon(horizonNames[item.placement.horizon]) : messages.linkToParentHint}</small></span>
      </button>
    </div>}
  </Popover>
}
