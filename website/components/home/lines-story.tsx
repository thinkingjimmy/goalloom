'use client'
/**
 * [INPUT]: Depends on lib/board, ../board/board, ../motion, ../icons
 * [OUTPUT]: Exports LinesStory and LinesCopy
 * [POS]: components/home's "01 / Relation lines" story: four case buttons drive one figure (Bottega's case list).
 *        Each case is a real deriveView of the demo board — filter, hover chain, fan-out, keyboard — so the figure
 *        never drifts from the app's rules. Narrow screens get the same view as an indented chain list.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SEED, deriveView, type FlowId, type Horizon, type ItemId } from '@/lib/board'
import { Board, type BoardCopy } from '../board/board'
import { Icon, type IconName } from '../icons'
import { useCarousel, useSeen } from '../motion'

export type LinesCopy = {
  eyebrow: string
  title: string[]
  body: string
  casesLabel: string
  cases: { title: string; desc: string }[]
  shortcuts: { newItem: string; search: string; undo: string; switchGoal: string }
  board: BoardCopy
  all: string
  flows: Record<FlowId, string>
}

const SHOWN: readonly Horizon[] = ['month', 'week', 'day']
const ICONS: IconName[] = ['filter', 'cursor', 'split', 'keyboard']
// filter · hover a mid chain · hover a parent fanning out · no filter (keyboard)
const CASES: { filter: FlowId | null; hover: ItemId | null; cursor?: { left: number; top: number } }[] = [
  { filter: 'a', hover: null },
  { filter: 'a', hover: 'w2', cursor: { left: 404, top: 190 } },
  { filter: 'a', hover: 'm1', cursor: { left: 176, top: 142 } },
  { filter: null, hover: null },
]
// The figure keeps a compact slice of the board; the hero shows the full, lived-in one.
const ITEMS = SEED.filter(item => SHOWN.includes(item.horizon) && !['m4', 'm5', 'w6', 'd5', 'd6'].includes(item.id))

function Chips({ copy, active, keys }: { copy: LinesCopy; active: FlowId | null; keys: boolean }) {
  return (
    <div className="bar">
      <span className="chip" data-on={active === null}><Icon name="all" size={14} strokeWidth={1.8} />{copy.all}{keys && <span className="keytip">⌘1</span>}</span>
      {(['a', 'b', 'c'] as const).map((flow, index) => (
        <span key={flow} className="chip" data-on={active === flow}>
          <span className="mark" style={{ borderColor: `var(--stroke-${flow})` }} />
          {active === flow && <span className="chip-label">{copy.flows[flow]}</span>}
          {keys && <span className="keytip">⌘{index + 2}</span>}
        </span>
      ))}
    </div>
  )
}

function Chain({ copy, at }: { copy: LinesCopy; at: number }) {
  const spec = CASES[at]!
  if (!spec.filter) {
    const keys: [string, string][] = [[copy.shortcuts.switchGoal, '⌘ 1–9'], [copy.shortcuts.newItem, '⌘ N'], [copy.shortcuts.search, '⌘ K'], [copy.shortcuts.undo, '⌘ Z']]
    return <div className="chain">{keys.map(([label, key]) => <div key={label} className="shortcut-row"><span>{label}</span><kbd className="kc large">{key}</kbd></div>)}</div>
  }
  const { rows } = deriveView(ITEMS, spec.filter, spec.hover)
  const shown = ITEMS.filter(item => rows.get(item.id) !== 'dim').slice(0, 5)
  return (
    <div className="chain">
      {shown.map(item => (
        <div key={item.id} className="trow" data-state={rows.get(item.id)} style={{ '--row-stroke': `var(--stroke-${item.flow})`, '--row-tint': `var(--tint-${item.flow})`, marginLeft: SHOWN.indexOf(item.horizon) * 18 } as React.CSSProperties}>
          <span className="fdot"><span /></span>
          <span className="check" />
          <div className="tline"><span className="ttitle">{copy.board.items[item.id]}</span></div>
          <span className="trow-meta">{copy.board.horizons[item.horizon]}</span>
        </div>
      ))}
    </div>
  )
}

export function LinesStory({ copy }: { copy: LinesCopy }) {
  const { ref, seen } = useSeen<HTMLDivElement>(0.3)
  const { active, auto, pick } = useCarousel(CASES.length, seen)
  const spec = CASES[active]!
  const { rows, edges } = deriveView(ITEMS, spec.filter, spec.hover)
  return (
    <div ref={ref} className="section story">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 className="h3 lines-break">{copy.title.map(line => <span key={line}>{line}</span>)}</h2>
        <p className="body">{copy.body}</p>
        <ul className="cases" data-auto={auto ? 'on' : 'off'} aria-label={copy.casesLabel}>
          {copy.cases.map((item, index) => (
            <li key={item.title}>
              <button type="button" aria-pressed={index === active} onClick={() => pick(index)}>
                <span className="case-head"><Icon name={ICONS[index]!} size={16} />{item.title}</span>
                <span className="case-desc">{item.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <figure className="fig fig-lines" aria-hidden="true">
        <div key={active} className="card reel">
          <Chips copy={copy} active={spec.filter} keys={!spec.filter} />
          <Board horizons={SHOWN} items={ITEMS} rows={rows} edges={edges} copy={copy.board} />
          {spec.cursor && <span className="cursor" style={spec.cursor}><Icon name="cursor" size={18} strokeWidth={1.8} /></span>}
          {!spec.filter && (
            <div className="shortcut-card">
              {([[copy.shortcuts.newItem, ['⌘', 'N']], [copy.shortcuts.search, ['⌘', 'K']], [copy.shortcuts.undo, ['⌘', 'Z']], [copy.shortcuts.switchGoal, ['⌘', '1–9']]] as const).map(([label, keys]) => (
                <div key={label}><span>{label}</span><span className="keys">{keys.map(key => <kbd key={key} className="kc large">{key}</kbd>)}</span></div>
              ))}
            </div>
          )}
        </div>
        <div key={`chain-${active}`} className="reel chain-wrap"><Chain copy={copy} at={active} /></div>
      </figure>
    </div>
  )
}
