/**
 * [INPUT]: Mounted demo rows, their transformed grid, saved item identities and resize notifications.
 * [OUTPUT]: useBoardGeometry and connectionPath for scale-normalized first-line, rounded goal/ownership connectors.
 * [POS]: Website board geometry; mirrors the product's 32px first line, 6px dots, 24px outline and 5px bends.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useLayoutEffect, useState, type RefObject } from 'react'
import type { DemoItem, ItemId } from '@/lib/board'

type Anchor = { left: number; right: number; top: number; bottom: number; y: number; indent: number; column: string }
type Geometry = { width: number; height: number; anchors: Partial<Record<ItemId, Anchor>> }

export function useBoardGeometry(grid: RefObject<HTMLDivElement | null>, items: readonly DemoItem[]) {
  const [geometry, setGeometry] = useState<Geometry>({ width: 0, height: 0, anchors: {} })
  useLayoutEffect(() => {
    const node = grid.current
    if (!node) return
    const measure = () => {
      const origin = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const width = parseFloat(style.width), height = parseFloat(style.height)
      const scaleX = origin.width / width || 1, scaleY = origin.height / height || 1
      const anchors: Geometry['anchors'] = {}
      for (const row of node.querySelectorAll<HTMLElement>('.trow[data-item]')) {
        if (!row.getClientRects().length) continue
        const r = row.getBoundingClientRect()
        anchors[row.dataset.item as ItemId] = {
          left: (r.left - origin.left) / scaleX, right: (r.right - origin.left) / scaleX,
          top: (r.top - origin.top) / scaleY, bottom: (r.bottom - origin.top) / scaleY,
          y: (r.top - origin.top) / scaleY + Math.min(r.height / scaleY, 32) / 2,
          indent: row.dataset.nested === 'true' ? 24 : 0,
          column: row.closest<HTMLElement>('.bcol')!.dataset.horizon!,
        }
      }
      const next = { width, height, anchors }
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    for (const row of node.querySelectorAll('.trow[data-item]')) observer.observe(row)
    measure()
    return () => observer.disconnect()
  }, [grid, items])
  return geometry
}

// Each bend is clamped independently, including a vertical start inside the outline gutter.
function orthogonal(x: number, y: number, turns: [number, number][], x2: number) {
  let d = `M${x} ${y}`
  turns.forEach(([bus, to], index) => {
    const next = turns[index + 1]?.[0] ?? x2
    const vertical = Math.abs(to - y) / 2
    const entry = Math.min(5, vertical, Math.abs(bus - x)), exit = Math.min(5, vertical, Math.abs(next - bus))
    const dy = Math.sign(to - y), dx = Math.sign(next - bus)
    d += entry < .5 ? `H${bus}` : `H${bus - Math.sign(bus - x) * entry}Q${bus} ${y} ${bus} ${y + dy * entry}`
    d += exit < .5 ? `V${to}` : `V${to - dy * exit}Q${bus} ${to} ${bus + dx * exit} ${to}`
    x = exit < .5 ? bus : bus + dx * exit
    y = to
  })
  return `${d}H${x2}`
}

export function connectionPath(parent: Anchor, child: Anchor, skip: boolean, anchors: Geometry['anchors']) {
  const nested = parent.column === child.column
  const x1 = nested ? parent.left + 9 + parent.indent : parent.right - 9
  const x2 = child.left + 6 + child.indent
  const exit = parent.right + 3, entry = child.left - 4
  const target = (parent.y + child.y) / 2
  const lanes = Object.values(anchors).filter(row => row.left > x1 && row.right < x2).flatMap(row => [row.top, row.bottom])
  const lane = lanes.reduce((best, y) => Math.abs(y - target) < Math.abs(best - target) ? y : best, lanes[0] ?? target)
  const turns: [number, number][] = nested ? [[x1, child.y]] : skip ? [[exit, lane], [entry, child.y]] : [[exit, child.y]]
  return { d: orthogonal(x1, parent.y, turns, x2), x: x1, y: parent.y, nested }
}
