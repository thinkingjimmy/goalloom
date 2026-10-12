'use client'
/**
 * [INPUT]: Depends on react, lib/board, ../board/board, ../board/composer, ../motion, ../icons
 * [OUTPUT]: Exports JevDemo and JevDemoCopy
 * [POS]: components/home's looping "add one item" film for the Jev story: cue the +, open the composer, type,
 *        Jev organizes, the suggestion, press "Create in Today", the item lands in Today with its goal colour and the
 *        toast. It plays only while seen and holds on the suggestion under reduced motion. Narrow screens keep the
 *        composer in place and show the landed row instead of the board.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import { SEED, type DemoItem, type Horizon } from '@/lib/board'
import { Board, type BoardCopy } from '../board/board'
import { Composer, type ComposerCopy } from '../board/composer'
import { Icon } from '../icons'
import { prefersReducedMotion, useSeen } from '../motion'

export type JevDemoCopy = {
  label: string
  typed: string
  board: BoardCopy
  all: string
  composer: ComposerCopy
  sentence: string
  createTo: string
  created: string
  undo: string
}

type Phase = 'idle' | 'open' | 'type' | 'thinking' | 'suggest' | 'press' | 'created'
const STEP: Record<Exclude<Phase, 'type'>, number> = { idle: 900, open: 450, thinking: 1000, suggest: 1500, press: 280, created: 2600 }
const TYPE_MS = 90
const NEXT: Record<Exclude<Phase, 'type'>, Phase> = { idle: 'open', open: 'type', thinking: 'suggest', suggest: 'press', press: 'created', created: 'idle' }

const SHOWN: readonly Horizon[] = ['month', 'week', 'day']
const BASE: DemoItem[] = SEED.filter(item => ['m1', 'm2', 'm3', 'w1', 'w4', 'd3', 'd4'].includes(item.id))
const LANDED: DemoItem = { id: 'n2', horizon: 'day', flow: 'a', parents: ['m1'] }
const NO_ROWS = new Map()

export function JevDemo({ copy }: { copy: JevDemoCopy }) {
  const { ref, seen } = useSeen<HTMLDivElement>(0.35)
  const [phase, setPhase] = useState<Phase>('idle')
  const [typed, setTyped] = useState(0)
  const [still, setStill] = useState(false)
  const chars = Array.from(copy.typed)

  useEffect(() => { if (prefersReducedMotion()) { setStill(true); setPhase('suggest'); setTyped(chars.length) } }, [chars.length])
  useEffect(() => {
    if (still || !seen) return
    if (phase === 'type') {
      const timer = setTimeout(() => {
        if (typed + 1 >= chars.length) { setTyped(chars.length); setPhase('thinking') } else setTyped(typed + 1)
      }, TYPE_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      const next = NEXT[phase]
      if (next === 'idle') setTyped(0)
      setPhase(next)
    }, STEP[phase])
    return () => clearTimeout(timer)
  }, [phase, typed, seen, still, chars.length])

  const open = phase !== 'idle' && phase !== 'created'
  const landed = phase === 'created'
  const items = landed ? [...BASE, LANDED] : BASE
  const composerPhase = phase === 'thinking' ? 'thinking' : phase === 'suggest' || phase === 'press' ? 'suggest' : typed ? 'typing' : 'empty'

  return (
    <div ref={ref} className="jev-stage" role="img" aria-label={copy.label}>
      <div className="bar">
        <span className="chip" data-on="true"><Icon name="all" size={14} strokeWidth={1.8} />{copy.all}</span>
        <span className="chip"><span className="mark" style={{ borderColor: 'var(--stroke-a)' }} /></span>
        <span className="chip"><span className="mark" style={{ borderColor: 'var(--stroke-b)' }} /></span>
      </div>
      <Board horizons={SHOWN} items={items} rows={NO_ROWS} edges={[]} copy={copy.board} newId={landed ? LANDED.id : null} />
      <span className="fab" data-cue={phase === 'idle'}><Icon name="add" size={22} /></span>
      {!landed && (
        // Closed while idle on the desktop board (the + is cued instead); narrow screens keep it in place.
        <div className="jev-composer" data-closed={!open && !still}>
          <div className="scrim" />
          <Composer
            copy={copy.composer} text={chars.slice(0, typed).join('')} phase={composerPhase} sentence={copy.sentence}
            createLabel={copy.createTo} pressed={phase === 'press'} tip={false}
          />
        </div>
      )}
      {landed && <div className="toast"><span>{copy.created}</span><span className="toast-action">{copy.undo} <kbd>⌘Z</kbd></span></div>}
      {landed && (
        <div className="jev-landed">
          <div className="trow" data-new="true" data-state="plain" style={{ '--row-stroke': 'var(--stroke-a)', '--row-tint': 'var(--tint-a)' } as React.CSSProperties}>
            <span className="fdot" style={{ opacity: 1 }}><span /></span>
            <span className="check" />
            <div className="tline"><span className="ttitle">{copy.board.items.n2}</span></div>
          </div>
          <p className="jev-landed-toast">{copy.created}</p>
        </div>
      )}
    </div>
  )
}
