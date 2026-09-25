'use client'
/**
 * [INPUT]: Depends on react, lib/board (DemoItem, deriveView output) and ../icons
 * [OUTPUT]: Exports Board (columns, rows and relation lines) and BoardCopy
 * [POS]: components/board's single renderer of the Goalloom board, used by the hero demo, the relation-line figures
 *        and the Jev demo. Geometry copies the app: 44px header band, 48px rows inset 8px from the column rules,
 *        flow dot 18px from the column edge; lines leave the parent's row edge, turn on the child's column rule and
 *        stop at the child's dot.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { DemoItem, EdgeView, Horizon, ItemId, RowState } from '@/lib/board'
import { Icon } from '../icons'

export type BoardCopy = {
  horizons: Record<Horizon, string>
  meta: Record<Horizon, string>
  items: Record<ItemId, string>
  complete: string
  reopen: string
  history: string
  addIn: string
}

type Interaction = { onHover: (id: ItemId | null) => void; onToggle: (id: ItemId) => void; onAdd: () => void }

const HEAD = 44, ROW = 48

const flowVars = (item: DemoItem): CSSProperties | undefined =>
  item.flow ? ({ '--row-stroke': `var(--stroke-${item.flow})`, '--row-tint': `var(--tint-${item.flow})` } as CSSProperties) : undefined

export function Board({ horizons, items, rows, edges, copy, interaction, newId, headActions = false }: {
  horizons: readonly Horizon[]
  items: readonly DemoItem[]
  rows: Map<ItemId, RowState>
  edges: readonly EdgeView[]
  copy: BoardCopy
  interaction?: Interaction
  newId?: ItemId | null
  headActions?: boolean
}) {
  const grid = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = grid.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const columns = horizons.map(horizon => items.filter(item => item.horizon === horizon))
  const place = new Map<ItemId, { c: number; r: number }>()
  columns.forEach((list, c) => list.forEach((item, r) => place.set(item.id, { c, r })))
  const colW = width / horizons.length

  return (
    <div className="board">
      <div ref={grid} className="board-grid" style={{ '--cols': horizons.length } as CSSProperties}>
        {horizons.map((horizon, c) => (
          <div key={horizon} className="bcol">
            <div className="bhead">
              <h3>{copy.horizons[horizon]}</h3>
              <span className="bmeta">{copy.meta[horizon]}</span>
              {headActions && <>
                <span className="ib sm" aria-hidden="true"><Icon name="history" size={16} /></span>
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
                    key={item.id} className="trow" style={flowVars(item)} data-state={rows.get(item.id) ?? 'plain'} data-done={!!item.done}
                    data-new={item.id === newId} data-interactive={!!interaction}
                    onMouseEnter={interaction && (() => interaction.onHover(item.id))} onMouseLeave={interaction && (() => interaction.onHover(null))}
                  >
                    {item.flow && <span className="fdot" aria-hidden="true"><span /></span>}
                    {interaction
                      ? <button type="button" className="check" aria-pressed={!!item.done} aria-label={(item.done ? copy.reopen : copy.complete) + title} onClick={() => interaction.onToggle(item.id)}>{item.done && <Icon name="check" size={12} strokeWidth={2.4} />}</button>
                      : <span className="check" aria-hidden="true">{item.done && <Icon name="check" size={12} strokeWidth={2.4} />}</span>}
                    <div className="tline"><span className="ttitle">{title}</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {width > 0 && edges.length > 0 && (
          <svg className="lines" width={width} height="100%" aria-hidden="true">
            {edges.map(edge => {
              const a = place.get(edge.from), b = place.get(edge.to)
              if (!a || !b) return null
              const x1 = (a.c + 1) * colW - 8, y1 = HEAD + ROW / 2 + a.r * ROW
              const xm = b.c * colW, x2 = b.c * colW + 14, y2 = HEAD + ROW / 2 + b.r * ROW
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path className="edge" data-state={edge.state} data-skip={edge.skip} d={`M${x1} ${y1}H${xm}V${y2}H${x2}`} />
                  <circle className="port" data-state={edge.state} cx={x1} cy={y1} r={2.5} />
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
