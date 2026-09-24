/**
 * [INPUT]: 当前条目、是否有上级、流程视图、忙碌/只读状态与受限提交。
 * [OUTPUT]: 复选框左侧的流程色点：流程根点开 4×2 命名色板改色或不设流程；有上级时只读显示继承的流程色。FlowColorMenu 为色板本体，看板流程圆点复用。
 * [POS]: items 详情标题行的前置控件，紧贴复选框（其描边即流程色）；改色仍由事务校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CSSProperties } from 'react'
import type { Item } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowRing, flowStroke, relationColors } from '../../lib/colors'
import { Popover } from '../../components/Popover'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'

export function FlowDot({ colors }: { colors: number[] }) {
  const ring = flowRing(colors)
  return <span aria-hidden="true" className="flow-dot" data-empty={!ring} style={ring ? { '--flow-ring': ring } as CSSProperties : undefined} />
}

export function FlowPicker({ item, hasParents, flows, busy, readOnly, open, setOpen, submit }: {
  item: Item; hasParents: boolean; flows: Flows; busy: boolean; readOnly: boolean; open: boolean; setOpen: (open: boolean) => void; submit: (action: Action) => Promise<unknown>
}) {
  if (hasParents) {
    // Children inherit colour through the DAG; the empty slot keeps the title aligned with flow roots.
    const inherited = flows.of(item.id)
    if (!inherited.length) return <span className="flow-handle" aria-hidden="true" />
    const label = `${messages.labelled(messages.flow, inherited.map(flow => flow.title).join(messages.listJoin))}${messages.paren(messages.followParent)}`
    return <span className="flow-handle" role="img" aria-label={label} title={label}><FlowDot colors={inherited.map(flow => flow.flowColor)} /></span>
  }
  const color = item.flowColor ?? null
  const label = messages.labelled(messages.flowColor, color === null ? messages.flowUnset : messages.colorNames[color]!)
  const choose = (index: number | null) => {
    setOpen(false)
    if (index !== color) void submit({ type: 'flowColor', itemId: item.id, expectedVersion: item.version, flowColor: index })
  }
  return <Popover open={open} onClose={() => setOpen(false)} anchor={
    <button type="button" className="flow-handle" aria-haspopup="true" aria-expanded={open} aria-label={label} title={label} disabled={readOnly} onClick={() => setOpen(!open)}>
      <FlowDot colors={color === null ? [] : [color]} />
    </button>
  }><FlowColorMenu itemId={item.id} color={color} flows={flows} busy={busy} onChoose={choose} /></Popover>
}

/** The 4×2 named palette plus 「不设流程」; `impact` (descendant count) spells out how much a flow-root change reaches. */
export function FlowColorMenu({ itemId, color, flows, busy, impact = 0, onChoose }: {
  itemId: string; color: number | null; flows: Flows; busy: boolean; impact?: number; onChoose: (index: number | null) => void
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
  </div>
}
