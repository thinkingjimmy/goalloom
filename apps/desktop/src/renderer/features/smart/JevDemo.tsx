/**
 * [INPUT]: 当前语言的预设示例文案（smartMessages.demo*）、列名与流程色；composer.css 的草稿卡样式。
 * [OUTPUT]: JevDemo：循环播放的只读示例——逐字输入 → 整理中 → 三张草稿卡依次出现（本周流程根、今天与本周的下级、截止周五）；减少动态效果时直接显示结果。
 * [POS]: Jev 步骤的价值说明，不调用任何服务、不读写工作区；与真实 composer 同一视觉语言。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import { horizonNames, messages, smartMessages as t } from '../../i18n'
import { flowVars } from '../../lib/colors'
import { FlowMark } from '../../components/FlowMark'
import '../composer/composer.css'

// Timeline in ticks: idle, type (fixed duration whatever the language), think, reveal cards one by one, hold.
const TICK_MS = 90, TYPE_START = 4, TYPE_END = 34, THINK_END = 48, CARD_GAP = 4, LOOP = 120
const FLOW = 1
const cards: { horizon: ItemHorizon; due: boolean; child: boolean }[] = [
  { horizon: 'week', due: false, child: false },
  { horizon: 'day', due: false, child: true },
  { horizon: 'week', due: true, child: true },
]

function reducedMotion(): boolean { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }

export function JevDemo() {
  const [tick, setTick] = useState(() => reducedMotion() ? LOOP : 0)
  useEffect(() => {
    if (reducedMotion()) return
    const timer = setInterval(() => setTick(value => value >= LOOP ? 0 : value + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [])
  const input = t.demoInput
  const typing = tick < TYPE_END, pending = !typing && tick < THINK_END
  const typed = input.slice(0, Math.ceil(input.length * Math.min(1, Math.max(0, tick - TYPE_START) / (TYPE_END - TYPE_START))))
  const shown = tick < THINK_END ? 0 : Math.min(cards.length, 1 + Math.floor((tick - THINK_END) / CARD_GAP))
  return <figure className="jev-demo min-w-0 m-0 pt-0 pr-6 pb-5 pl-6 rounded-[14px] bg-surface" aria-label={t.demoFigure}>
    <div className="jev-demo-head h-14 flex items-center gap-2"><h2>{messages.newItem}</h2><span>{t.demoLabel}</span></div>
    <div className="jev-demo-body" aria-hidden="true">
      <div className="jev-demo-input min-h-18 px-3 py-2.5 rounded-[8px] bg-raised text-[15px] leading-[1.7]">{typed || <span className="jev-demo-placeholder text-subtle">{t.placeholder}</span>}{typing && typed && <span className="jev-demo-caret inline-block w-[1.5px] ml-px bg-foreground" />}</div>
      <p className="composer-status">{pending && <span className="composer-spinner" />}{typing ? t.smartIdle : pending ? t.smartPending : t.demoReady(cards.length)}</p>
      <div className="composer-preview">
        {cards.map((card, index) => <article key={index} className="draft-card jev-demo-card opacity-[0]" data-shown={index < shown}>
          <div className="draft-head"><span className="check" style={flowVars([FLOW])} /><span className="draft-title-text">{t.demoItems[index]}</span></div>
          <div className="draft-fields">
            <span className="draft-badge">{horizonNames[card.horizon]}</span>
            {card.due && <span className="draft-badge">{t.demoDue}</span>}
            {card.child ? <span className="parent-chip"><FlowMark colors={[FLOW]} /><span className="chip-text">{t.demoParent(t.demoItems[0]!)}</span></span>
              : <span className="draft-badge">{messages.newFlow}</span>}
          </div>
        </article>)}
      </div>
    </div>
  </figure>
}
