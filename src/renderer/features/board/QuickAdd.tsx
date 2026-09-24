/**
 * [INPUT]: 目标列、流程派生视图、可选拆解上级与受限提交。
 * [OUTPUT]: 列内连续录入行；复选框选择加入流程/新流程/不加入，Enter 创建并保留选择。
 * [POS]: board 的创建入口；加入流程即关联到流程根，新流程即设置唯一颜色，均由事务复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useRef, useState } from 'react'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import { messages, horizonNames } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars, relationColors } from '../../lib/colors'
import { FlowMark } from '../../components/FlowMark'
import { Popover } from '../../components/Popover'

export interface SplitParent { id: string; title: string }
type Choice = { kind: 'none' } | { kind: 'join'; id: string } | { kind: 'new'; color: number } | { kind: 'split'; parent: SplitParent }

export function QuickAdd({ horizon, flows, split, submit, busy, close }: { horizon: ItemHorizon; flows: Flows; split: SplitParent | null; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void }) {
  const [title, setTitle] = useState('')
  const [choice, setChoice] = useState<Choice>(split ? { kind: 'split', parent: split } : { kind: 'none' })
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLInputElement>(null), root = useRef<HTMLDivElement>(null)
  const joinable = flows.visible
  const free = relationColors.map((_, index) => index).filter(index => !flows.owner(index))
  const parentId = choice.kind === 'join' ? choice.id : choice.kind === 'split' ? choice.parent.id : null
  const colors = choice.kind === 'new' ? [choice.color] : parentId ? flows.colorsOf(parentId) : []
  const ring = flowVars(colors)
  const label = choice.kind === 'new' ? messages.newFlowName(messages.colorNames[choice.color]!)
    : choice.kind === 'join' ? messages.joinHint(flows.all.find(flow => flow.id === choice.id)?.title ?? '')
    : choice.kind === 'split' ? messages.splitHint(choice.parent.title) : messages.noFlow
  const pick = (next: Choice) => { setChoice(next); setPicking(false); input.current?.focus() }
  const create = async () => {
    const text = title.trim()
    if (!text || busy) return
    const expectedParentVersion = parentId ? (await desktopApi().getItem(parentId).catch(() => null))?.item.version ?? null : null
    if (parentId && expectedParentVersion === null) return
    const result = await submit({ type: 'create', title: text, horizon, parentId, expectedParentVersion, flowColor: choice.kind === 'new' ? choice.color : null })
    if (!result) return
    setTitle('')
    // The new item now owns the colour, so following entries join that flow.
    const created = (result as { itemId: string | null }).itemId
    if (choice.kind === 'new' && created) setChoice({ kind: 'join', id: created })
    input.current?.focus()
  }
  return <div className="quick-add" ref={root} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget as Node | null) && !title.trim() && !picking) close()
  }}>
    <Popover open={picking} onClose={() => setPicking(false)} anchor={
      <button type="button" className={`check ${ring ? '' : 'check-dashed'}`} style={ring} aria-label={messages.chooseFlow(label)} aria-haspopup="listbox" aria-expanded={picking} onMouseDown={event => event.preventDefault()} onClick={() => setPicking(!picking)} />
    }>
      <div className="menu flow-picker" role="listbox" aria-label={messages.flow}>
        {joinable.length > 0 && <p className="menu-heading">{messages.joinFlow}</p>}
        {joinable.map(flow => <button key={flow.id} role="option" aria-selected={choice.kind === 'join' && choice.id === flow.id} className="menu-item" onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'join', id: flow.id })}>
          <FlowMark colors={[flow.flowColor]} /><span className="menu-text">{flow.title}</span>
        </button>)}
        {joinable.length > 0 && <div className="menu-separator" />}
        <p className="menu-heading">{messages.newFlow}</p>
        <div className="swatches">
          <button role="option" aria-selected={choice.kind === 'none'} aria-label={messages.noFlow} title={messages.noFlow} className="swatch" onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'none' })}><FlowMark colors={[]} dashed /></button>
          {free.map(index => <button key={index} role="option" aria-selected={choice.kind === 'new' && choice.color === index} aria-label={messages.newFlowName(messages.colorNames[index]!)} title={messages.colorNames[index]!} className="swatch" onMouseDown={event => event.preventDefault()} onClick={() => pick({ kind: 'new', color: index })}><FlowMark colors={[index]} /></button>)}
        </div>
      </div>
    </Popover>
    <input ref={input} aria-label={messages.newToColumn(horizonNames[horizon])} placeholder={messages.titlePlaceholder} autoFocus value={title} maxLength={500}
      onChange={event => setTitle(event.target.value)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') { event.preventDefault(); void create() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      }} />
    <span className="quick-add-hint" aria-hidden="true">{choice.kind === 'none' ? messages.addHint : label}</span>
  </div>
}
