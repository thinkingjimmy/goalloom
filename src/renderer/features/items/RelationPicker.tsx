/**
 * [INPUT]: 当前条目、方向（上级/下级）、有效关系、流程视图、看板候选与受限提交。
 * [OUTPUT]: 可搜索的勾选列表：勾选即关联，取消即解除；流程根不能作为下级。
 * [POS]: items 详情的关系入口；自关联/重复/环/流程约束最终由事务拒绝并提示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import type { Item } from '../../../shared/contracts/entities'
import type { ItemDetail } from '../../../shared/contracts/queries'
import { messages, horizonNames } from '../../i18n/messages'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'

export function RelationPicker({ side, detail, flows, candidates, submit, onError }: {
  side: 'parent' | 'child'; detail: ItemDetail; flows: Flows; candidates: Item[]
  submit: (action: Action) => Promise<unknown>; onError: (message: string) => void
}) {
  const self = detail.item
  const [query, setQuery] = useState(''), [results, setResults] = useState<Item[]>([])
  useEffect(() => {
    if (!query.trim()) return
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 })
      .then(page => { if (active) setResults(page.items) }).catch(() => { if (active) onError(messages.relationSearchFailed) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const edgeFor = (other: string) => detail.relations.find(edge => side === 'parent' ? edge.parentId === other && edge.childId === self.id : edge.childId === other && edge.parentId === self.id)
  const roots = new Set(flows.all.map(flow => flow.id))
  const toggle = async (other: Item) => {
    const edge = edgeFor(other.id)
    try {
      if (edge) {
        const [parent, child] = await Promise.all([desktopApi().getItem(edge.parentId), desktopApi().getItem(edge.childId)])
        await submit({ type: 'unlink', relationId: edge.id, expectedParentVersion: parent.item.version, expectedChildVersion: child.item.version })
      } else {
        const [target, current] = await Promise.all([desktopApi().getItem(other.id), desktopApi().getItem(self.id)])
        const [parent, child] = side === 'parent' ? [target.item, current.item] : [current.item, target.item]
        await submit({ type: 'link', parentId: parent.id, childId: child.id, expectedParentVersion: parent.version, expectedChildVersion: child.version })
      }
    } catch { onError(messages.unlinkFailed) }
  }
  const rows = (query.trim() ? results : candidates).filter(item => item.id !== self.id && item.status !== 'cancelled').slice(0, 8)
  return <div className="menu relation-picker" role="dialog" aria-label={side === 'parent' ? messages.linkParent : messages.linkChild}>
    <input className="menu-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={messages.searchItems} aria-label={side === 'parent' ? messages.searchParents : messages.searchChildren} />
    <div role="group">
      {rows.map(item => {
        const linked = !!edgeFor(item.id)
        const blocked = side === 'child' && roots.has(item.id) && !linked
        return <button key={item.id} type="button" role="menuitemcheckbox" aria-checked={linked} className="menu-item" disabled={blocked} title={blocked ? messages.flowRootNoParent : undefined} onClick={() => void toggle(item)}>
          <FlowMark colors={flows.colorsOf(item.id)} />
          <span className="menu-text">{item.title}{item.archivedAt ? messages.archivedSuffix : ''}</span>
          <span className="menu-hint">{blocked ? messages.flowRootTag : horizonNames[item.placement.horizon]}</span>
          <span className="menu-check">{linked && <Icon name="check" size={14} strokeWidth={2} />}</span>
        </button>
      })}
      {!rows.length && <p className="menu-note">{messages.noResults}</p>}
    </div>
  </div>
}
