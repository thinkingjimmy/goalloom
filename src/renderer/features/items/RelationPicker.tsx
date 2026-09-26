/**
 * [INPUT]: Current item id and horizon, its incident edges, flow view, summary candidates and actions.
 * [OUTPUT]: Searchable relationship controls offering only horizon-valid endpoints (existing links stay listed for removal),
 *           with local hints and authoritative error feedback.
 * [POS]: Relationship entry shared by the detail dialog and the board flow dot; storage rejects self-links, duplicates,
 *        cycles, invalid roots and horizon violations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { mayParent } from '../../../domain/relations'
import { messages, horizonNames } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'

export function RelationPicker({ side, self, edges, flows, candidates, submit, onError, note }: {
  side: 'parent' | 'child'; self: { id: string; horizon: ItemHorizon }; edges: Snapshot['relations']; flows: Flows; candidates: ItemSummary[]
  submit: (action: Action) => Promise<unknown>; onError: (message: string) => void; note?: ReactNode
}) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<ItemSummary[]>([])
  useEffect(() => {
    if (!query.trim()) return
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 })
      .then(page => { if (active) setResults(page.items) }).catch(() => { if (active) onError(messages.relationSearchFailed) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const edgeFor = (other: string) => edges.find(edge => side === 'parent' ? edge.parentId === other && edge.childId === self.id : edge.childId === other && edge.parentId === self.id)
  const roots = new Set(flows.all.map(flow => flow.id))
  const toggle = async (other: ItemSummary) => {
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
  // A parent is a bigger goal in a longer horizon; Later never links. Nearest horizon first, current links on top.
  const eligible = (item: ItemSummary) => side === 'parent' ? mayParent(item.placement.horizon, self.horizon) : mayParent(self.horizon, item.placement.horizon)
  const distance = (item: ItemSummary) => Math.abs(horizons.indexOf(item.placement.horizon) - horizons.indexOf(self.horizon))
  const rows = (query.trim() ? results : candidates)
    .filter(item => item.id !== self.id && item.status !== 'cancelled' && (!!edgeFor(item.id) || eligible(item)))
    .sort((a, b) => Number(!!edgeFor(b.id)) - Number(!!edgeFor(a.id)) || distance(a) - distance(b))
    .slice(0, 8)
  return <div className="menu relation-picker" role="dialog" aria-label={side === 'parent' ? messages.linkParent : messages.linkChild}>
    <input className="menu-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={messages.searchItems} aria-label={side === 'parent' ? messages.searchParents : messages.searchChildren} />
    {note && <div className="menu-note relation-note">{note}</div>}
    <p className="menu-note relation-rule">{side === 'parent' ? messages.longerOnly : messages.shorterOnly}</p>
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
