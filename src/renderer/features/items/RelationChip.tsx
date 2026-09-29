/**
 * [INPUT]: One side of an item's incident edges, flow view, navigation guard and the shared RelationPicker inputs.
 * [OUTPUT]: A compact 上级/下级 chip whose popover lists linked items for navigation and hands off to the picker;
 *           with no links (or nothing to list) it opens the picker directly.
 * [POS]: items detail property row; relationship writes stay in RelationPicker and are revalidated by storage.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import type { ItemDetail } from '../../../shared/contracts/queries'
import { messages } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { Popover } from '../../components/Popover'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'
import { RelationPicker } from './RelationPicker'

export function RelationChip({ side, self, edges, open, setOpen, canLink, flows, candidates, navigate, submit, onError }: {
  side: 'parent' | 'child'; self: { id: string; horizon: ItemHorizon }; edges: ItemDetail['relations']; open: boolean; setOpen: (open: boolean) => void
  canLink: boolean; flows: Flows; candidates: ItemSummary[]; navigate: (id: string) => void; submit: (action: Action) => Promise<unknown>; onError: (message: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const mine = edges.filter(edge => side === 'parent' ? edge.childId === self.id : edge.parentId === self.id)
  if (!mine.length && !canLink) return null
  const label = side === 'parent' ? messages.parents : messages.children
  const toggle = () => { setPicking(!mine.length); setOpen(!open) }
  return <Popover open={open} onClose={() => setOpen(false)} anchor={
    <button type="button" className="detail-chip" data-empty={!mine.length} aria-expanded={open} aria-label={mine.length ? `${label} ${mine.length}` : side === 'parent' ? messages.linkParent : messages.linkExisting} onClick={toggle}>
      <Icon name={side} size={14} strokeWidth={1.8} />{label}{mine.length > 0 && <span className="detail-chip-count">{mine.length}</span>}
    </button>
  }>
    {picking ? <RelationPicker side={side} self={self} edges={edges} flows={flows} candidates={candidates} submit={submit} onError={onError} />
      : <div className="menu relation-menu" role="menu" aria-label={label}>
        {mine.map(edge => {
          const other = side === 'parent' ? edge.parentId : edge.childId
          return <button type="button" role="menuitem" key={edge.id} className="menu-item" onClick={() => { setOpen(false); navigate(other) }}>
            <FlowMark colors={flows.colorsOf(other)} /><span className="menu-text">{side === 'parent' ? edge.parentTitle : edge.childTitle}{(side === 'parent' ? edge.parentArchived : edge.childArchived) ? messages.archivedSuffix : ''}</span>
          </button>
        })}
        {canLink && <>
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => setPicking(true)}><Icon name="link" size={14} />{side === 'parent' ? messages.linkParent : messages.linkExisting}</button>
        </>}
      </div>}
  </Popover>
}
