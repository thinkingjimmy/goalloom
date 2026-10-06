/**
 * [INPUT]: 流程色序号、占用情况和选择回调。
 * [OUTPUT]: FlowDot 色点，以及 FlowColorMenu：4×2 命名色板加「不设流程」。详情流程芯片和看板圆点共用色板。
 * [POS]: 流程色的视觉与选择菜单；详情上的触发芯片在 DetailFlowChip。改色由事务校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CSSProperties, ReactNode } from 'react'
import { messages } from '../../i18n'
import type { Flows } from '../../state/flows'
import { flowRing, flowStroke, relationColors } from '../../lib/colors'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'

export function FlowDot({ colors }: { colors: number[] }) {
  const ring = flowRing(colors)
  return <span aria-hidden="true" className="flow-dot" data-empty={!ring} style={ring ? { '--flow-ring': ring } as CSSProperties : undefined} />
}

/** The 4×2 named palette plus 「不设流程」; `impact` (descendant count) spells out how much a flow-root change reaches. */
export function FlowColorMenu({ itemId, color, flows, busy, impact = 0, onChoose, extra }: {
  itemId: string; color: number | null; flows: Flows; busy: boolean; impact?: number; onChoose: (index: number | null) => void; extra?: ReactNode
}) {
  return <div className="menu flow-menu">
    <div className="flow-menu-header">
      <span>{messages.flowColor}</span>
      <p>{color !== null && impact ? messages.flowImpact(impact) : messages.flowColorHint}</p>
    </div>
    <div className="flow-swatches" role="radiogroup" aria-label={messages.flowColor}>
      {relationColors.map((_, index) => {
        const owner = flows.owner(index)
        const taken = !!owner && owner.id !== itemId
        const name = taken ? messages.flowTaken(messages.colorNames[index]!, owner.title) : messages.colorNames[index]!
        return <button key={index} type="button" role="radio" aria-checked={color === index} aria-label={name} title={name} className="flow-swatch" disabled={busy || taken} onClick={() => onChoose(index)}>
          <span className="flow-swatch-mark" style={{ color: flowStroke(index) }}><FlowMark colors={[index]} />{color === index && <Icon name="check" size={12} strokeWidth={2.5} />}</span>
          <span className="flow-swatch-label">{taken ? messages.quote(owner.title) : messages.colorNames[index]}</span>
        </button>
      })}
    </div>
    {color !== null && <>
      <div className="menu-separator" />
      <button className="menu-item" disabled={busy} onClick={() => onChoose(null)}><Icon name="close" size={14} />{impact ? messages.clearFlowCount(impact + 1) : messages.noFlowColor}</button>
    </>}
    {extra}
  </div>
}
