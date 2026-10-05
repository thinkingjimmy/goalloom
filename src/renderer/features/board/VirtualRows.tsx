/**
 * [INPUT]: Ordered identities, viewport, render function, drag/selection/menu pins and shared input-aware focus restoration.
 * [OUTPUT]: Resize-observed rows (observers follow the mounted window, not every parent render) with bounded motion retention, FLIP, keyboard traversal and synchronous reveal; pointer title returns preserve focus without a ring until keyboard input or blur, while inert panels ignore reveal requests.
 * [POS]: Board-only windowing. Focus, drag and open-menu rows remain mounted; persisted order stays authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { ItemSummary } from '../../../shared/contracts/entities'
import { RowMotion } from './RowMotion'
import { returnFocus } from '../../lib/focus'

const revealEvent = 'goalloom:reveal-row'
interface Reveal { id: string; focus: string | null; origin?: 'pointer' | 'keyboard' }
export function revealRow(id: string, focus: string | null = null, origin?: Reveal['origin']): void {
  window.dispatchEvent(new CustomEvent<Reveal>(revealEvent, { detail: { id, focus, ...(origin ? { origin } : {}) } }))
}

const overscan = 5
const estimatedRowHeight = 32
const controlSelector = 'button:not(:disabled), a[href], [tabindex="0"]'

export function VirtualRows({ scope = 'board', items, dragging, highlighted, pinned = null, render }: { scope?: string; items: ItemSummary[]; dragging: string | null; highlighted: string | null; pinned?: string | null; render: (item: ItemSummary, index: number, total: number) => ReactNode }) {
  const list = useRef<HTMLDivElement>(null), heights = useRef(new Map<string, number>())
  const [measured, setMeasured] = useState(0), [focused, setFocused] = useState<string | null>(null)
  const [range, setRange] = useState({ start: 0, end: 20 })
  const indexes = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])
  const offsets = useMemo(() => {
    const values = [0]
    for (const item of items) values.push(values.at(-1)! + (heights.current.get(item.id) ?? estimatedRowHeight))
    return values
  }, [items, measured])
  const motionOffsets = useMemo(() => new Map(items.map((item, index) => [item.id, offsets[index]!])), [items, offsets])
  const orderKey = items.map(item => item.id).join('|')
  const previousWindow = useRef<string[]>([])
  const [retained, setRetained] = useState({ key: orderKey, scope, ids: [] as string[] })
  if (retained.key !== orderKey || retained.scope !== scope) setRetained({ key: orderKey, scope, ids: retained.scope === scope ? previousWindow.current : [] })
  useEffect(() => {
    if (!retained.ids.length) return
    const timer = setTimeout(() => setRetained(current => current === retained ? { ...current, ids: [] } : current), 260)
    return () => clearTimeout(timer)
  }, [retained])
  useLayoutEffect(() => { previousWindow.current = items.slice(range.start, range.end).map(item => item.id) })
  const windowed = items.length > 50
  const latest = useRef({ items, indexes, offsets, windowed })
  latest.current = { items, indexes, offsets, windowed }
  const update = () => {
    const node = list.current, root = node?.closest('.column-content')
    if (!node || !(root instanceof HTMLElement) || node.closest('[inert]')) return
    const { offsets, items } = latest.current
    const top = root.getBoundingClientRect().top - node.getBoundingClientRect().top
    const first = offsets.findIndex(value => value >= top)
    const start = Math.max(0, (first < 0 ? items.length : first) - 1 - overscan)
    const after = offsets.findIndex(value => value > top + root.clientHeight)
    const end = Math.min(items.length, (after < 0 ? items.length : after) + overscan)
    setRange(previous => previous.start === start && previous.end === end ? previous : { start, end })
  }
  const reveal = ({ id, focus, origin }: Reveal) => {
    const index = latest.current.indexes.get(id), node = list.current, root = node?.closest('.column-content')
    if (index === undefined || !node || !(root instanceof HTMLElement) || node.closest('[inert]')) return
    const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop + latest.current.offsets[index]!
    const bottom = top + (heights.current.get(id) ?? estimatedRowHeight)
    if (top < root.scrollTop) root.scrollTop = top
    else if (bottom > root.scrollTop + root.clientHeight) root.scrollTop = bottom - root.clientHeight
    flushSync(() => { setFocused(id); update() })
    const row = document.getElementById(`item-${id}`)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const control = focus === ':last-control' ? [...row?.querySelectorAll<HTMLElement>(controlSelector) ?? []].at(-1) : focus ? row?.querySelector<HTMLElement>(focus) : null
    const target = control ?? row?.querySelector<HTMLElement>('.task-title')
    if (focus && target) returnFocus(target, origin)
  }
  const handler = useRef(reveal); handler.current = reveal
  useEffect(() => {
    const receive = (event: Event) => handler.current((event as CustomEvent<Reveal>).detail)
    window.addEventListener(revealEvent, receive)
    return () => window.removeEventListener(revealEvent, receive)
  }, [])
  useLayoutEffect(() => {
    const node = list.current, root = node?.closest('.column-content')
    if (!node || !(root instanceof HTMLElement)) return
    let frame = 0
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() }) }
    const observer = new ResizeObserver(onScroll)
    observer.observe(root); root.addEventListener('scroll', onScroll, { passive: true }); update()
    return () => { observer.disconnect(); root.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])
  const mounted = new Set<number>()
  if (windowed) {
    for (let index = range.start; index < range.end; index++) mounted.add(index)
    for (const id of [focused, dragging, highlighted, pinned, ...retained.ids]) { const index = id ? indexes.get(id) : undefined; if (index !== undefined) mounted.add(index) }
  } else items.forEach((_item, index) => mounted.add(index))
  const observedKey = [...mounted].filter(index => index < items.length).sort((a, b) => a - b).map(index => items[index]!.id).join('|')
  useLayoutEffect(() => {
    const valid = new Set(latest.current.items.map(item => item.id))
    for (const id of heights.current.keys()) if (!valid.has(id)) heights.current.delete(id)
    const measure = (nodes: HTMLElement[]) => {
      let changed = false
      for (const node of nodes) {
        const id = node.dataset.virtualId!, height = node.getBoundingClientRect().height
        if (height > 0 && heights.current.get(id) !== height) { heights.current.set(id, height); changed = true }
      }
      if (changed) setMeasured(value => value + 1)
    }
    const nodes = [...list.current?.querySelectorAll<HTMLElement>('[data-virtual-id]') ?? []]
    const observer = new ResizeObserver(entries => measure(entries.map(entry => entry.target as HTMLElement)))
    nodes.forEach(node => observer.observe(node)); measure(nodes); update()
    return () => observer.disconnect()
  }, [observedKey, orderKey, measured])
  const children: ReactNode[] = []
  let previous = 0
  for (const index of [...mounted].filter(index => index < items.length).sort((a, b) => a - b)) {
    if (index > previous) children.push(<div key={`gap:${items[index]!.id}`} aria-hidden="true" style={{ height: offsets[index]! - offsets[previous]! }} />)
    const item = items[index]!
    children.push(<div role="presentation" key={item.id} data-virtual-id={item.id}>{render(item, index, items.length)}</div>)
    previous = index + 1
  }
  if (previous < items.length) children.push(<div key="tail" aria-hidden="true" style={{ height: offsets.at(-1)! - offsets[previous]! }} />)
  return <RowMotion scope={scope} orderKey={orderKey} offsets={motionOffsets} dragging={!!dragging}><div ref={list} role="list" className="virtual-rows"
    onFocusCapture={event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]')?.dataset.itemId; if (id) setFocused(id) }}
    onKeyDownCapture={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || document.documentElement.dataset.dragging) return
      const target = event.target as HTMLElement, row = target.closest<HTMLElement>('[data-item-id]'), index = row ? indexes.get(row.dataset.itemId!) : undefined
      if (index === undefined || !row) return
      const controls = [...row.querySelectorAll<HTMLElement>(controlSelector)]
      let next: number | undefined, selector = `.${target.classList[0]}`
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = items.length - 1
      if (event.key === 'Tab' && !event.shiftKey && target === controls.at(-1) && index + 1 < items.length) { next = index + 1; selector = controlSelector }
      if (event.key === 'Tab' && event.shiftKey && target === controls[0] && index > 0) { next = index - 1; selector = ':last-control' }
      if (next === undefined) return
      event.preventDefault(); reveal({ id: items[next]!.id, focus: selector })
    }}>{children}</div></RowMotion>
}
