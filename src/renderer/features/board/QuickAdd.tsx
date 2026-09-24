/**
 * [INPUT]: Target column, flow view, board items (flow-root horizons), optional parent and guarded submission.
 * [OUTPUT]: Continuous inline creation preserving input typed during save or refresh; offers only flows whose root is in a longer
 *           horizon, and no flow choice at all in Later.
 * [POS]: Board creation entry; input revision controls clearing, storage owns relationship constraints.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef, useState } from 'react'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import { mayParent } from '../../../domain/relations'
import { messages, horizonNames } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars, relationColors } from '../../lib/colors'
import { FlowMark } from '../../components/FlowMark'
import { Popover } from '../../components/Popover'

export interface SplitParent { id: string; title: string }
type Choice = { kind: 'none' } | { kind: 'join'; id: string } | { kind: 'new'; color: number } | { kind: 'split'; parent: SplitParent }

export function QuickAdd({ horizon, flows, items, split, submit, busy, close }: { horizon: ItemHorizon; flows: Flows; items: ItemSummary[]; split: SplitParent | null; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void }) {
  const [title, setTitle] = useState('')
  const [choice, setChoice] = useState<Choice>(split ? { kind: 'split', parent: split } : { kind: 'none' })
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLInputElement>(null), root = useRef<HTMLDivElement>(null)
  const revision = useRef(0), saving = useRef(false), choiceRef = useRef(choice)
  choiceRef.current = choice
  // Joining links the new item under the flow root, so the root must sit in a longer horizon; Later starts no flow.
  const joinable = flows.visible.filter(flow => { const root = items.find(item => item.id === flow.id); return !!root && mayParent(root.placement.horizon, horizon) })
  const free = horizon === 'later' ? [] : relationColors.map((_, index) => index).filter(index => !flows.owner(index))
  const flowless = horizon === 'later' && !split
  const parentId = choice.kind === 'join' ? choice.id : choice.kind === 'split' ? choice.parent.id : null
  const colors = choice.kind === 'new' ? [choice.color] : parentId ? flows.colorsOf(parentId) : []
  const ring = flowVars(colors)
  const label = choice.kind === 'new' ? messages.newFlowName(messages.colorNames[choice.color]!)
    : choice.kind === 'join' ? messages.joinHint(flows.all.find(flow => flow.id === choice.id)?.title ?? '')
    : choice.kind === 'split' ? messages.splitHint(choice.parent.title) : messages.noFlow
  const pick = (next: Choice) => { setChoice(next); setPicking(false); input.current?.focus() }
  const create = async () => {
    const text = title.trim()
    if (!text || busy || saving.current) return
    const submittedRevision = revision.current
    saving.current = true
    try {
      const expectedParentVersion = parentId ? (await desktopApi().getItem(parentId).catch(() => null))?.item.version ?? null : null
      if (parentId && expectedParentVersion === null) return
      const result = await submit({ type: 'create', title: text, horizon, parentId, expectedParentVersion, flowColor: choice.kind === 'new' ? choice.color : null })
      if (!result) return
      if (revision.current === submittedRevision) setTitle('')
      // The new item now owns the colour, so following entries join that flow.
      const created = (result as { itemId: string | null }).itemId
      if (choice.kind === 'new' && created && choiceRef.current === choice) setChoice({ kind: 'join', id: created })
      input.current?.focus()
    } finally { saving.current = false }
  }
  return <div className="quick-add" ref={root} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget as Node | null) && !title.trim() && !picking) close()
  }}>
    {flowless ? <span className="check check-dashed" aria-hidden="true" /> : <Popover open={picking} onClose={() => setPicking(false)} anchor={
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
    </Popover>}
    <input ref={input} aria-label={messages.newToColumn(horizonNames[horizon])} placeholder={messages.titlePlaceholder} autoFocus value={title} maxLength={500}
      onChange={event => { revision.current++; setTitle(event.target.value) }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') { event.preventDefault(); void create() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      }} />
    <span className="quick-add-hint" aria-hidden="true">{choice.kind === 'none' ? messages.addHint : label}</span>
  </div>
}
