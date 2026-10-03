/**
 * [INPUT]: A live TODO, its upcoming periods with localized names, guarded submission, detail opening and an optional decompose action.
 * [OUTPUT]: Compact pointer/keyboard context menu with non-redundant yearless date hints, persistent source-row activation, virtual-row pinning and deterministic focus restoration.
 * [POS]: Board-only action wrapper; the main process resolves and validates the actual next period.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Action } from '../../state/use-workspace'
import { messages, insightMessages as t } from '../../i18n'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '../../components/ui/context-menu'
import { Icon } from '../../components/icons'
import { revealRow } from './VirtualRows'

export interface Upcoming { period: PlanningPeriod; label: string; hint: string | null }

export function TaskMenu({ item, upcoming, relations, disabled, submit, select, decompose, onMenu, onMoved, children }: {
  item: ItemSummary; upcoming: Upcoming[]; relations: number; disabled: boolean; children: ReactElement
  submit: (action: Action) => Promise<unknown>; select: (id: string) => void; decompose: (() => void) | null
  onMenu: (id: string | null) => void; onMoved: (id: string) => void
}) {
  const [next] = upcoming as [Upcoming, ...Upcoming[]]
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLElement | null>(null), returnTo = useRef<HTMLElement | null>(null), selecting = useRef(false), outside = useRef(false)
  const change = (nextOpen: boolean) => {
    if (nextOpen && disabled) return
    if (nextOpen) {
      selecting.current = false; outside.current = false
      returnTo.current = trigger.current?.contains(document.activeElement) ? document.activeElement as HTMLElement : trigger.current?.querySelector<HTMLElement>('.task-title') ?? null
    }
    setOpen(nextOpen)
    if (nextOpen) onMenu(item.id)
  }
  useEffect(() => { if (disabled && open) change(false) }, [disabled])
  const move = (period: { kind: 'next' } | { kind: 'date'; startDate: string }) => {
    selecting.current = true
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: item.placement.horizon, period })
      .then(result => { if (result) onMoved(item.id); else returnTo.current?.focus({ preventScroll: true }) })
  }
  useEffect(() => () => onMenu(null), [onMenu])
  return <ContextMenu open={open} onOpenChange={change}>
    <ContextMenuTrigger asChild disabled={disabled} ref={node => { trigger.current = node }} onKeyDown={event => {
      if (disabled || event.nativeEvent.isComposing || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 24, clientY: rect.top + Math.min(rect.height, 36) }))
    }}>{children}</ContextMenuTrigger>
    <ContextMenuContent aria-label={messages.itemActions(item.title)} onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => event.stopPropagation()} onPointerDownOutside={() => { outside.current = true }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        if (!selecting.current && !outside.current) { revealRow(item.id); returnTo.current?.focus({ preventScroll: true }) }
        // Release the virtual pin only after focus can keep the source row mounted.
        onMenu(null)
      }}>
      <ContextMenuItem disabled={disabled} onSelect={() => move({ kind: 'next' })}>
        <Icon name="forward" size={16} /><span className="context-menu-label">{messages.moveToPeriod(next.label)}</span>{next.hint && <span className="menu-hint">{next.hint}</span>}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={disabled}><Icon name="calendar" size={16} /><span className="context-menu-label">{t.menuMoveTo}</span><Icon name="next" size={14} /></ContextMenuSubTrigger>
        <ContextMenuSubContent onKeyDown={event => event.stopPropagation()}>
          {upcoming.map(value => <ContextMenuItem key={value.period.id} disabled={disabled} onSelect={() => move({ kind: 'date', startDate: value.period.startDate })}>
            <span className="context-menu-label">{value.label}</span>{value.hint && <span className="menu-hint">{value.hint}</span>}
          </ContextMenuItem>)}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      {decompose && <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; decompose() }}><Icon name="smart" size={16} /><span className="context-menu-label">{t.menuDecompose}</span></ContextMenuItem>}
      <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; select(item.id) }}><Icon name="split" size={16} /><span className="context-menu-label">{t.menuLinkParent}</span></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={disabled} onSelect={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: 'done' })}><Icon name="check" size={16} /><span className="context-menu-label">{t.menuComplete}</span></ContextMenuItem>
      <ContextMenuItem className="danger" disabled={disabled} onSelect={() => {
        if (relations && !window.confirm(messages.deletePreview(relations))) return
        void submit({ type: 'delete', itemId: item.id, expectedVersion: item.version })
      }}><Icon name="delete" size={16} /><span className="context-menu-label">{t.menuDelete}</span></ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
}
