'use client'
/**
 * [INPUT]: Depends on react, lib/board, ../board/board, ../board/composer and ../icons
 * [OUTPUT]: Exports HeroDemo and HeroDemoCopy
 * [POS]: components/home's playable app window inside the hero: hover rows, filter by goal from the top bar, complete
 *        items, create one through the composer (placed by the app's own Jev sentence) and undo it from the toast.
 *        The scene switcher below jumps between the board, the composer and a filtered relation-line view.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'
import { FLOWS, SEED, deriveView, type DemoItem, type FlowId, type Horizon, type ItemId } from '@/lib/board'
import { Board, type BoardCopy } from '../board/board'
import { Composer, type ComposerCopy } from '../board/composer'
import { Icon } from '../icons'

export type HeroDemoCopy = BoardCopy & {
  all: string
  onlyFlow: string
  flows: Record<FlowId, string>
  search: string
  columns: string
  settings: string
  newItem: string
  composer: ComposerCopy & { heroText: string }
  sentence: string
  createTo: string
  created: string
  undone: string
  undo: string
  dismiss: string
  scenes: string
  sceneBoard: string
  sceneJev: string
  sceneLines: string
}

// Later is hidden, as a narrow window would show it: the four planning horizons carry the story.
const SHOWN: readonly Horizon[] = ['cycle', 'month', 'week', 'day']
// The created item mirrors the composer's sentence: Today, under the "Finish the site & downloads" goal.
const CREATED: DemoItem = { id: 'n1', horizon: 'day', flow: 'a', parents: ['m1'] }
type Scene = 'board' | 'jev' | 'lines'

export function HeroDemo({ copy }: { copy: HeroDemoCopy }) {
  const [items, setItems] = useState<DemoItem[]>(() => [...SEED])
  const [filter, setFilter] = useState<FlowId | null>(null)
  const [hover, setHover] = useState<ItemId | null>(null)
  const [composer, setComposer] = useState(false)
  const [toast, setToast] = useState<'created' | 'undone' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const show = (next: 'created' | 'undone') => {
    clearTimeout(timer.current)
    setToast(next)
    timer.current = setTimeout(() => setToast(null), 5000)
  }
  const create = () => {
    setItems(list => (list.some(item => item.id === CREATED.id) ? list : [...list, CREATED]))
    setComposer(false)
    show('created')
  }
  const undo = () => { setItems(list => list.filter(item => item.id !== CREATED.id)); show('undone') }
  const toggle = (id: ItemId) => setItems(list => list.map(item => (item.id === id ? { ...item, done: !item.done } : item)))
  const pickFlow = (flow: FlowId | null) => { setFilter(current => (flow && current === flow ? null : flow)); setHover(null); setComposer(false) }
  const scene: Scene = composer ? 'jev' : filter === 'a' ? 'lines' : 'board'
  const goScene = (next: Scene) => {
    setHover(null)
    setComposer(next === 'jev')
    setFilter(next === 'lines' ? 'a' : null)
  }
  const { rows, edges } = deriveView(items, filter, hover)
  const created = items.some(item => item.id === CREATED.id)

  return <>
    <div className="window">
      <div className="bar">
        <div className="lights" aria-hidden="true"><span /><span /><span /></div>
        <button type="button" className="chip" aria-pressed={filter === null} onClick={() => pickFlow(null)}>
          <Icon name="all" size={14} strokeWidth={1.8} />{copy.all}
        </button>
        {FLOWS.map(flow => (
          <button key={flow} type="button" className="chip" aria-pressed={filter === flow} aria-label={copy.onlyFlow + copy.flows[flow]} title={copy.flows[flow]} onClick={() => pickFlow(flow)}>
            <span className="mark" style={{ borderColor: `var(--stroke-${flow})` }} />
            {filter === flow && <span className="chip-label">{copy.flows[flow]}</span>}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span className="ib" aria-hidden="true" title={copy.search}><Icon name="search" size={18} /></span>
        <span className="ib" aria-hidden="true" title={copy.columns}><Icon name="views" size={18} /><span className="ib-dot" /></span>
        <span className="ib" aria-hidden="true" title={copy.settings}><Icon name="settings" size={18} /></span>
      </div>
      <Board
        horizons={SHOWN} items={items} rows={rows} edges={edges} copy={copy} headActions
        newId={toast === 'created' ? CREATED.id : null}
        interaction={{ onHover: setHover, onToggle: toggle, onAdd: () => setComposer(true) }}
      />
      <button type="button" className="fab" aria-label={`${copy.newItem} ⌘N`} onClick={() => setComposer(true)}>
        <Icon name="add" size={22} />
      </button>
      {toast && (
        <div className="toast" role="status">
          <span>{toast === 'created' ? copy.created : copy.undone}</span>
          {toast === 'created' && created && <button type="button" className="toast-action" onClick={undo}>{copy.undo} <kbd>⌘Z</kbd></button>}
          <button type="button" className="toast-close" aria-label={copy.dismiss} onClick={() => setToast(null)}><Icon name="close" size={12} /></button>
        </div>
      )}
      {composer && <>
        <div className="scrim" onClick={() => setComposer(false)} />
        <Composer
          copy={copy.composer} text={copy.composer.heroText} phase="suggest" sentence={copy.sentence} createLabel={copy.createTo}
          onCreate={create} onClose={() => setComposer(false)}
        />
      </>}
    </div>
    <div className="tabs" role="tablist" aria-label={copy.scenes}>
      {([['board', copy.sceneBoard], ['jev', copy.sceneJev], ['lines', copy.sceneLines]] as const).map(([id, label]) => (
        <button key={id} type="button" role="tab" className="tab" aria-selected={scene === id} onClick={() => goScene(id)}>{label}</button>
      ))}
    </div>
  </>
}
