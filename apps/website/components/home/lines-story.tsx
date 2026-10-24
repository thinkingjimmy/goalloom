'use client'
/**
 * [INPUT]: Shared board data/renderer, localized relation copy and Hugeicons.
 * [OUTPUT]: LinesStory and LinesCopy for a fixed highlighted goal-chain illustration.
 * [POS]: ProductTour relation panel; reuses product geometry and a compact mobile chain.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SEED, deriveView, type FlowId, type Horizon } from '@/lib/board'
import { Board, type BoardCopy } from '../board/board'
import { Icon } from '../icons'

export type LinesCopy = { title: string[]; board: BoardCopy; all: string; flows: Record<FlowId, string> }
const SHOWN: readonly Horizon[] = ['month', 'week', 'day']
const ITEMS = SEED.filter(item => SHOWN.includes(item.horizon) && !['m4', 'm5', 'w6', 'd5', 'd6'].includes(item.id))

export function LinesStory({ copy }: { copy: LinesCopy }) {
  const { rows, edges } = deriveView(ITEMS, 'a', 'm1')
  const chain = ITEMS.filter(item => rows.get(item.id) === 'lit' || rows.get(item.id) === 'hot').slice(0, 6)
  return <figure className="fig fig-lines" role="img" aria-label={copy.title.join(' ')}>
    <div className="lines-artwork" aria-hidden="true" inert>
      <div className="card">
        <div className="bar">
          <span className="chip"><Icon name="all" size={14} />{copy.all}</span>
          {(['a', 'b', 'c'] as const).map(flow => <span className="chip" key={flow} data-on={flow === 'a'}>
            <span className="mark" style={{ borderColor: `var(--stroke-${flow})` }} />
            {flow === 'a' && <span className="chip-label">{copy.flows[flow]}</span>}
          </span>)}
        </div>
        <Board horizons={SHOWN} items={ITEMS} rows={rows} edges={edges} copy={copy.board} cursorId="m1" />
      </div>
      <div className="chain-wrap"><div className="chain">
        {chain.map(item => <div key={item.id} className="trow" data-state={rows.get(item.id)} style={{ '--row-stroke': `var(--stroke-${item.flow})`, '--row-tint': `var(--tint-${item.flow})`, marginLeft: SHOWN.indexOf(item.horizon) * 18 } as React.CSSProperties}>
          <span className="fdot"><span /></span><span className="check" />
          <div className="tline"><span className="ttitle">{copy.board.items[item.id]}</span></div>
          <span className="trow-meta">{copy.board.horizons[item.horizon]}</span>
        </div>)}
      </div></div>
    </div>
  </figure>
}
