'use client'
/**
 * [INPUT]: Depends on react, lib/board, ./geometry, ./links and ../icons
 * [OUTPUT]: Exports Board (columns, rows and relation lines) and BoardCopy
 * [POS]: components/board's single renderer of the Goalloom board, used by the hero demo, the relation-line figures
 *        the read-only Hero phone and the Jev demo. Product metrics: 32px minimum rows, wrapping titles, local URL cards and 24px children.
 *        Measured first-line anchors keep rounded goal and ownership connectors attached as content grows.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef, type CSSProperties } from 'react'
import type { DemoItem, EdgeView, Horizon, ItemId, RowState } from '@/lib/board'
import { columnItems } from '@/lib/board'
import { Icon } from '../icons'
import { connectionPath, useBoardGeometry } from './geometry'
import { DemoLinkPreview, DemoLinkTitle, type LinkPreviewCopy } from './links'

export type BoardCopy = {
  horizons: Record<Horizon, string>
  meta: Record<Horizon, string>
  items: Record<ItemId, string>
  complete: string
  reopen: string
  history: string
  addIn: string
  previews: LinkPreviewCopy
}

type Interaction = { onHover: (id: ItemId | null) => void; onToggle: (id: ItemId) => void; onAdd: () => void }

const flowVars = (item: DemoItem): CSSProperties | undefined =>
  item.flow ? ({ '--row-stroke': `var(--stroke-${item.flow})`, '--row-tint': `var(--tint-${item.flow})` } as CSSProperties) : undefined

export function Board({ horizons, items, rows, edges, copy, interaction, newId, cursorId, headActions = false }: {
  horizons: readonly Horizon[]
  items: readonly DemoItem[]
  rows: Map<ItemId, RowState>
  edges: readonly EdgeView[]
  copy: BoardCopy
  interaction?: Interaction
  newId?: ItemId | null
  cursorId?: ItemId | null
  headActions?: boolean
}) {
  const grid = useRef<HTMLDivElement>(null)
  const { width, height, anchors } = useBoardGeometry(grid, items)
  const columns = horizons.map(horizon => columnItems(items, horizon))

  return (
    <div className="board">
      <div ref={grid} className="board-grid" style={{ '--cols': horizons.length } as CSSProperties}>
        {horizons.map((horizon, c) => (
          <div key={horizon} className="bcol" data-horizon={horizon}>
            <div className="bhead">
              <h3>{copy.horizons[horizon]}</h3>
              <span className="bmeta">{copy.meta[horizon]}</span>
              <span className="bhead-chevron" aria-hidden="true"><Icon name="expand" size={12} strokeWidth={2} /></span>
              <span className="bhead-spacer" />
              {headActions && <>
                <span className="ib sm bhead-more" aria-hidden="true"><Icon name="more" size={16} /></span>
                {interaction
                  ? <button type="button" className="ib sm" aria-label={copy.addIn + copy.horizons[horizon]} onClick={interaction.onAdd}><Icon name="add" size={16} /></button>
                  : <span className="ib sm" aria-hidden="true"><Icon name="add" size={16} /></span>}
              </>}
            </div>
            <div className="rows">
              {columns[c]!.map(item => {
                const title = copy.items[item.id]
                return (
                  <div
                    key={item.id} className="trow" style={flowVars(item)} data-item={item.id} data-nested={!!item.nestingParent && columns[c]!.some(parent => parent.id === item.nestingParent)} data-state={rows.get(item.id) ?? 'plain'} data-done={!!item.done}
                    data-new={item.id === newId} data-interactive={!!interaction}
                    onMouseEnter={interaction && (() => interaction.onHover(item.id))} onMouseLeave={interaction && (() => interaction.onHover(null))}
                    onFocus={interaction && (() => interaction.onHover(item.id))}
                    onBlur={interaction && (event => { if (!event.currentTarget.contains(event.relatedTarget)) interaction.onHover(null) })}
                  >
                    {item.flow && <span className="fdot" aria-hidden="true"><span /></span>}
                    {interaction
                      ? <button type="button" className="check" aria-pressed={!!item.done} aria-label={(item.done ? copy.reopen : copy.complete) + title} onClick={() => interaction.onToggle(item.id)}>{item.done && <Icon name="check" size={12} strokeWidth={2.4} />}</button>
                      : <span className="check" aria-hidden="true">{item.done && <Icon name="check" size={12} strokeWidth={2.4} />}</span>}
                    <div className="tcontent">
                      <div className="tline"><span className="ttitle">{title}{item.link && <> <DemoLinkTitle id={item.link} copy={copy.previews} /></>}</span></div>
                      {item.link && <DemoLinkPreview id={item.link} copy={copy.previews} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {width > 0 && edges.length > 0 && (
          <svg className="lines" width={width} height={height} aria-hidden="true">
            {edges.map(edge => {
              const a = anchors[edge.from], b = anchors[edge.to]
              if (!a || !b) return null
              const path = connectionPath(a, b, edge.skip, anchors)
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path className="edge" data-from={edge.from} data-to={edge.to} data-state={edge.state} data-skip={edge.skip} data-nested={path.nested} d={path.d} />
                  {!path.nested && <circle className="port" data-state={edge.state} cx={path.x} cy={path.y} r={3} />}
                </g>
              )
            })}
          </svg>
        )}
        {cursorId && anchors[cursorId] && <span className="cursor" style={{ left: anchors[cursorId].left + 56, top: anchors[cursorId].y + 8 }}><Icon name="cursor" size={18} strokeWidth={1.8} /></span>}
      </div>
    </div>
  )
}
