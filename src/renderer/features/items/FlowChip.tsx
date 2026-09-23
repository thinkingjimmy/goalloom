/**
 * [INPUT]: 当前条目、是否有上级、流程视图、忙碌/只读状态与受限提交。
 * [OUTPUT]: 标题行内的流程标签：流程根可点开色板改色；有上级时只读显示继承的流程。
 * [POS]: items 详情标题的附属控件，取代独立的流程字段行；改色仍由事务校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Item } from '../../../shared/contracts/entities'
import { messages } from '../../i18n/messages'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { relationColors } from '../../lib/colors'
import { Popover } from '../../components/Popover'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'

export function FlowChip({ item, hasParents, flows, busy, readOnly, open, setOpen, submit }: {
  item: Item; hasParents: boolean; flows: Flows; busy: boolean; readOnly: boolean; open: boolean; setOpen: (open: boolean) => void; submit: (action: Action) => Promise<unknown>
}) {
  if (hasParents) {
    const inherited = flows.of(item.id)
    return inherited.length ? <span className="flow-chip" title={messages.followParent}>
      <FlowMark colors={inherited.map(flow => flow.flowColor)} />{inherited.map(flow => flow.title).join('、')}
    </span> : null
  }
  const color = item.flowColor ?? null
  const choose = (index: number | null) => {
    setOpen(false)
    if (index !== color) void submit({ type: 'flowColor', itemId: item.id, expectedVersion: item.version, flowColor: index })
  }
  return <Popover open={open} onClose={() => setOpen(false)} anchor={
    <button type="button" className="flow-chip" data-empty={color === null} aria-haspopup="true" aria-expanded={open} disabled={readOnly}
      aria-label={`${messages.flow}：${color === null ? messages.noFlowColor : relationColors[color]!.name}`} onClick={() => setOpen(!open)}>
      {color === null ? <><Icon name="add" size={14} />{messages.flow}</> : <><FlowMark colors={[color]} />{relationColors[color]!.name}</>}
    </button>
  }>
    <div className="menu flow-menu">
      <p className="menu-heading">{messages.flow}</p>
      <div className="swatches" role="radiogroup" aria-label={messages.flow}>
        {[null, ...relationColors.map((_, index) => index)].map(index => {
          const owner = index === null ? undefined : flows.owner(index)
          const taken = !!owner && owner.id !== item.id
          const name = index === null ? messages.noFlowColor : taken ? messages.flowTaken(relationColors[index]!.name, owner!.title) : relationColors[index]!.name
          return <button key={index ?? 'none'} type="button" role="radio" aria-checked={color === index} aria-label={name} title={name} className="swatch" disabled={busy || taken}
            onClick={() => choose(index)}><FlowMark colors={index === null ? [] : [index]} dashed={index === null} /></button>
        })}
      </div>
    </div>
  </Popover>
}
