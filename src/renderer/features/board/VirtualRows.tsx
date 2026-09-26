/**
 * [INPUT]: Ordered summary identities, scroll viewport, render function, active drag and selection.
 * [OUTPUT]: Resize-observed rows with bounded overscan, logical button/link keyboard traversal and synchronous reveal.
 * [POS]: Board-only windowing. Focus and drag rows remain mounted; persisted order stays authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { ItemSummary } from '../../../shared/contracts/entities'

const revealEvent = 'goalloom:reveal-row'
interface Reveal { id: string; focus: string | null }
export function revealRow(id: string, focus: string | null = null): void {
  window.dispatchEvent(new CustomEvent<Reveal>(revealEvent, { detail: { id, focus } }))
}
const overscan = 5
const controlSelector = 'button:not(:disabled), a[href], [tabindex="0"]'

export function VirtualRows({ items, dragging, highlighted, render }: { items: ItemSummary[]; dragging: string | null; highlighted: string | null; render: (item: ItemSummary, index: number, total: number) => ReactNode }) {
  const list = useRef<HTMLDivElement>(null), heights = useRef(new Map<string, number>())
  const [measured, setMeasured] = useState(0), [focused, setFocused] = useState<string | null>(null)
  const [range, setRange] = useState({ start: 0, end: 20 })
  const indexes = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])
  const offsets = useMemo(() => {
    const values = [0]
    for (const item of items) values.push(values.at(-1)! + (heights.current.get(item.id) ?? 41))
    return values
  }, [items, measured])
  const windowed = items.length > 50
  const latest = useRef({ items, indexes, offsets, windowed })
  latest.current = { items, indexes, offsets, windowed }
  const update = () => {
    const node = list.current, root = node?.closest('.column-content')
    if (!node || !(root instanceof HTMLElement)) return
    const { offsets, items } = latest.current
    const top = root.getBoundingClientRect().top - node.getBoundingClientRect().top
    const first = offsets.findIndex(value => value >= top)
    const start = Math.max(0, (first < 0 ? items.length : first) - 1 - overscan)
    const after = offsets.findIndex(value => value > top + root.clientHeight)
    const end = Math.min(items.length, (after < 0 ? items.length : after) + overscan)
    setRange(previous => previous.start === start && previous.end === end ? previous : { start, end })
  }
  const reveal = ({ id, focus }: Reveal) => {
    const index = latest.current.indexes.get(id), node = list.current, root = node?.closest('.column-content')
    if (index === undefined || !node || !(root instanceof HTMLElement)) return
    const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop + latest.current.offsets[index]!
    const bottom = top + (heights.current.get(id) ?? 41)
    if (top < root.scrollTop) root.scrollTop = top
    else if (bottom > root.scrollTop + root.clientHeight) root.scrollTop = bottom - root.clientHeight
    flushSync(() => { setFocused(id); update() })
    const row = document.getElementById(`item-${id}`)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const control = focus === ':last-control' ? [...row?.querySelectorAll<HTMLElement>(controlSelector) ?? []].at(-1) : focus ? row?.querySelector<HTMLElement>(focus) : null
    if (focus) (control ?? row?.querySelector<HTMLElement>('.task-title'))?.focus({ preventScroll: true })
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
  useLayoutEffect(() => {
    const valid = new Set(items.map(item => item.id))
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
  })
  const mounted = new Set<number>()
  if (windowed) {
    for (let index = range.start; index < range.end; index++) mounted.add(index)
    for (const id of [focused, dragging, highlighted]) { const index = id ? indexes.get(id) : undefined; if (index !== undefined) mounted.add(index) }
  } else items.forEach((_item, index) => mounted.add(index))
  const children: ReactNode[] = []
  let previous = 0
  for (const index of [...mounted].filter(index => index < items.length).sort((a, b) => a - b)) {
    if (index > previous) children.push(<div key={`gap:${items[index]!.id}`} aria-hidden="true" style={{ height: offsets[index]! - offsets[previous]! }} />)
    const item = items[index]!
    children.push(<div role="presentation" key={item.id} data-virtual-id={item.id}>{render(item, index, items.length)}</div>)
    previous = index + 1
  }
  if (previous < items.length) children.push(<div key="tail" aria-hidden="true" style={{ height: offsets.at(-1)! - offsets[previous]! }} />)
  return <div ref={list} role="list" className="virtual-rows"
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
    }}>{children}</div>
}
