/**
 * [INPUT]: Visible item summary, flow colors, topology/candidates, workspace date, upcoming destinations, an optional decompose action and guarded actions.
 * [OUTPUT]: Accessible local/cross-period task row with parent navigation, saved links, due/description signals, independent flow ports, placement dragging and hierarchy/lifecycle menus; titles fully wrap, lit rows carry `data-lit`/`--row-tint`, and Later checkboxes stay uncolored.
 *           A double click edits the title in place with guarded Tab nesting/Shift+Tab detachment; pending level writes retain drafts and serialize title commits.
 * [POS]: One virtual board row; Board owns placement, preview, dimming and which row is editing; the peek and detail own description bodies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { nestingText } from '../../../shared/i18n/nesting'
import { sameOutlinePeriod } from '../../../domain/nesting'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEventHandler, type MouseEvent, type PointerEventHandler } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, useLocale } from '../../i18n'
import { flowVars } from '../../lib/colors'
import { longDate, shortDate } from '../../i18n/format'
import { returnFocus } from '../../lib/focus'
import type { Flows } from '../../state/flows'
import type { Action } from '../../state/use-workspace'
import { Icon } from '../../components/icons'
import { FlowDot } from './FlowDot'
import { NoteSignal } from './NoteSignal'
import { LinkTitle } from '../../components/links/LinkText'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkUrls } from '../../components/links/parse'
import { TaskMenu, type Upcoming } from './TaskMenu'
import { TaskParentLink } from './TaskContext'

// Long enough that the second click of a double-click still lands on the title.
// Opening the detail on the first click would cover the row with the modal.
const detailClickDelay = 400
const singleLine = (value: string) => value.replace(/\r?\n/g, ' ')

function TitleField({ title, itemId, renameTitle, endEdit, nest, unnest, submit }: {
  title: string; itemId: string
  nest: Action | null; unnest: Action | null; submit: (action: Action) => Promise<unknown>
  renameTitle: (itemId: string, title: string) => Promise<boolean>
  endEdit: (itemId: string) => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(() => singleLine(title))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const settled = useRef(false)
  const composing = useRef(false), levelWrite = useRef<Promise<boolean> | null>(null)
  const commit = async (save: boolean) => {
    if (settled.current) return
    settled.current = true
    if (levelWrite.current && !await levelWrite.current) { settled.current = false; return }
    const next = draftRef.current.trim()
    if (save && next && next !== title) {
      const ok = await renameTitle(itemId, next)
      if (!ok) { settled.current = false; input.current?.focus(); return }
    }
    endEdit(itemId)
  }
  useLayoutEffect(() => {
    const node = input.current
    if (!node) return
    // field-sizing can grow the width into one line; measure the wrapped height instead.
    node.style.height = '0px'
    node.style.height = `${node.scrollHeight}px`
  }, [draft])
  useLayoutEffect(() => {
    const node = input.current
    if (!node) return
    node.focus()
    const end = node.value.length
    node.setSelectionRange(end, end)
  }, [])
  return <textarea ref={input} className="task-title-input" aria-label={messages.editTitle} value={draft} rows={1} maxLength={500}
    onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
    onPointerDown={event => event.stopPropagation()}
    onChange={event => setDraft(singleLine(event.target.value))}
    onBlur={() => { window.setTimeout(() => { void commit(true) }, 0) }}
    onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || composing.current) return
      if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const action = event.shiftKey ? unnest : nest
        if (levelWrite.current || action) {
          event.preventDefault(); event.stopPropagation()
          if (!levelWrite.current && !settled.current && action) {
            const pending = submit(action).then(Boolean).catch(() => false)
            levelWrite.current = pending
            void pending.finally(() => { if (levelWrite.current === pending) levelWrite.current = null })
          }
        }
      } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void commit(false) }
      else if (event.key === 'Enter') {
        event.preventDefault()
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) void commit(true)
      }
    }} />
}

export const TaskRow = memo(function TaskRow({ index, total, item, flows, relations, candidates, today, selected, dimmed, tint, disabled, editing, editLocked, select, submit, onPreview, upcoming, decompose, assist, onMenu, onMoved, beginEdit, endEdit, renameTitle, onNest, nestingParent, nestingTarget = null }: {
  nestingTarget?: ItemSummary | null
  nestingParent: ItemSummary | undefined
  onNest: (id: string) => void
  index: number; total: number; item: ItemSummary; flows: Flows; relations: Snapshot['relations']; candidates: ItemSummary[]; today: string
  selected: boolean; dimmed: boolean; tint: string | undefined; disabled: boolean; editing: boolean; editLocked: boolean
  select: (id: string) => void; submit: (action: Action) => Promise<unknown>; onPreview: (itemId: string | null) => void
  assist?: ((itemId: string) => void) | undefined
  upcoming: Upcoming[] | null; decompose: ((item: ItemSummary) => void) | null; onMenu: (id: string | null) => void; onMoved: (id: string) => void
  beginEdit: (id: string) => void; endEdit: (id: string) => void; renameTitle: (itemId: string, title: string) => Promise<boolean>
}) {
  useLocale()
  const localParent = nestingParent && sameOutlinePeriod(item.placement, nestingParent.placement)
  const remoteParent = nestingParent && !localParent
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled, animateLayoutChanges: () => false })
  const done = item.status === 'done'
  const colored = !done && item.placement.horizon !== 'later'
  const ring = colored ? flowVars(flows.colorsOf(item.id)) : undefined
  const owners = flows.of(item.id).map(flow => flow.title).join(messages.listJoin)
  const overdue = !done && item.dueDate !== null && item.dueDate < today
  const hasLinks = useMemo(() => linkUrls(item.title).length > 0, [item.title])
  const openTimer = useRef(0)
  const wasEditing = useRef(false)
  const frozen = editLocked || isDragging
  useEffect(() => () => window.clearTimeout(openTimer.current), [])
  useLayoutEffect(() => {
    if (editing) { wasEditing.current = true; return }
    if (!wasEditing.current) return
    wasEditing.current = false
    const row = document.getElementById(`item-${item.id}`)
    const active = document.activeElement
    if (document.querySelector('.task-title-input')) return
    if (active && active !== document.body && !row?.contains(active)) return
    const button = row?.querySelector<HTMLElement>('.task-title')
    if (button) returnFocus(button, 'pointer')
  }, [editing, item.id])
  const startEdit = () => { window.clearTimeout(openTimer.current); if (!frozen) beginEdit(item.id) }
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) { event.preventDefault(); startEdit(); return }
    if (event.detail === 0 || frozen) { window.clearTimeout(openTimer.current); select(item.id); return }
    window.clearTimeout(openTimer.current)
    openTimer.current = window.setTimeout(() => select(item.id), detailClickDelay)
  }
  const title = editing
    ? <TitleField title={item.title} itemId={item.id} renameTitle={renameTitle} endEdit={endEdit} submit={submit}
      nest={!frozen && nestingTarget ? { type: 'nest', itemId: item.id, parentId: nestingTarget.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version,
        expectedParentVersion: nestingTarget.version, expectedParentPlacementVersion: nestingTarget.placement.version } : null}
      unnest={!frozen && item.placement.nestingParentId ? { type: 'unnest', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version } : null} />
    : hasLinks
      ? <LinkTitle text={item.title} onOpen={activate} onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); startEdit() }} />
      : <button type="button" className="task-title" onClick={activate} onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); startEdit() }}><span>{item.title}</span></button>
  const line = <div className="task-line">
    {title}
    {item.dueDate && !overdue && !done && <span className="row-meta tabular" title={`${messages.dueDate} ${longDate(item.dueDate)}`}>{shortDate(item.dueDate)}</span>}
    {overdue && <span className="row-icon overdue" role="img" aria-label={messages.dueOverdue(longDate(item.dueDate!))} title={messages.dueOverdue(longDate(item.dueDate!))}><Icon name="overdue" size={16} /></span>}
  </div>
  const owner = remoteParent && <TaskParentLink item={item} parent={nestingParent} disabled={disabled} select={select} />
  const row = <article role="listitem" aria-posinset={index + 1} aria-setsize={total} aria-level={item.placement.nestingParentId ? 2 : 1} aria-description={item.placement.nestingParentId ? `${nestingText().belongsTo} ${nestingParent?.title ?? ''}` : undefined} id={`item-${item.id}`} ref={setNodeRef} className={`task-row ${isDragging ? 'dragging' : ''}`} data-item-id={item.id} data-nested={!!localParent} data-nesting-parent={item.placement.nestingParentId ?? undefined} data-context={!!item.archivedAt || item.status === 'cancelled'} data-highlighted={selected} data-dimmed={dimmed} data-done={done} data-lit={!!tint || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition, '--row-tint': tint } as CSSProperties} onPointerDown={event => { if (event.button === 0 && !event.ctrlKey) (listeners?.onPointerDown as PointerEventHandler | undefined)?.(event) }}>
    <FlowDot item={item} flows={flows} relations={relations} candidates={candidates} disabled={disabled} submit={submit} onPreview={onPreview} />
    <button className="drag-handle" {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined} aria-label={messages.dragItem(item.title)}><Icon name="drag" size={14} /></button>
    <button className="check" data-checked={done} style={ring} title={colored && owners ? messages.labelled(messages.flow, owners) : undefined}
      aria-label={`${done ? messages.reopen : messages.complete} ${item.title}`} disabled={disabled}
      onClick={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: done ? 'todo' : 'done' })}>
      {done && <Icon name="check" size={12} strokeWidth={2.5} />}
    </button>
    {editing || hasLinks || item.note || item.guidance || owner ? <div className="task-content">{line}{owner}{(item.note || item.guidance) && <NoteSignal itemId={item.id} title={item.title} note={item.note} guidance={item.guidance} />}{hasLinks && <LinkPreviews text={item.title} />}</div> : line}
  </article>
  const links = relations.filter(edge => edge.parentId === item.id || edge.childId === item.id).length
  return !item.archivedAt && item.status !== 'cancelled' ? <TaskMenu onNest={() => onNest(item.id)} item={item} upcoming={item.status === 'todo' || candidates.some(candidate => candidate.placement.nestingParentId === item.id && sameOutlinePeriod(item.placement, candidate.placement) && candidate.status === 'todo') ? upcoming ?? [] : []} relations={links} disabled={disabled || isDragging} submit={submit} select={select}
    assist={item.status === 'todo' && assist ? () => assist(item.id) : undefined} decompose={item.status === 'todo' && decompose ? () => decompose(item) : null} onMenu={onMenu} onMoved={onMoved}>{row}</TaskMenu> : row
})
