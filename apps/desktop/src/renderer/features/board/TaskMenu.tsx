/**
 * [INPUT]: A visible task, its period and workspace calendar, guarded submission, detail navigation and optional todo assistance/decomposition.
 * [OUTPUT]: Next-period shortcut, shared period picker submenu, nesting and lifecycle actions with source-row activation, virtual pinning and focus return.
 * [POS]: Board-only action wrapper; the main process validates selected destinations and resolves the next period.
 */
import { menuStyles } from '../../components/ui/menu'
import { cn } from '../../lib/utils'
import { nestingText } from '../../../shared/i18n/nesting'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { CalendarConfig, ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Action } from '../../state/use-workspace'
import { assistanceMessages } from '../../i18n/assistance'
import { messages, insightMessages as t } from '../../i18n'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '../../components/ui/context-menu'
import { Icon } from '../../components/icons'
import { PeriodPickerPanel } from '../../components/period-picker/PeriodPickerPanel'
import { revealRow } from './VirtualRows'
import type { FocusScope } from '../../components/focus/FocusMark'

export interface TaskMenuPeriods {
  period: PlanningPeriod; current: PlanningPeriod; calendar: CalendarConfig; today: string
  next: { label: string; hint: string | null }
}

export function TaskMenu({ item, periods, relations, disabled, submit, select, decompose, assist, onMenu, onMoved, children, onNest, focus = null }: {
  onNest: () => void
  focus?: { scope: FocusScope; on: boolean; run: () => void } | null
  item: ItemSummary; periods: TaskMenuPeriods | null; relations: number; disabled: boolean; children: ReactElement
  submit: (action: Action) => Promise<unknown>; select: (id: string) => void; decompose: (() => void) | null; assist?: (() => void) | undefined
  onMenu: (id: string | null) => void; onMoved: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerTrigger = useRef<HTMLDivElement>(null)
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
    if (disabled || selecting.current) return
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
      {periods && <><ContextMenuItem disabled={disabled} onSelect={() => move({ kind: 'next' })}>
        <Icon name="forward" size={16} /><span className="context-menu-label">{messages.moveToPeriod(periods.next.label)}</span>{periods.next.hint && <span className={cn(menuStyles.hint, 'menu-hint')}>{periods.next.hint}</span>}
      </ContextMenuItem>
      <ContextMenuSub open={pickerOpen} onOpenChange={setPickerOpen}>
        <ContextMenuSubTrigger ref={pickerTrigger} disabled={disabled}><Icon name="calendar" size={16} /><span className="context-menu-label">{t.menuMoveTo}</span><Icon name="next" size={14} /></ContextMenuSubTrigger>
        <ContextMenuSubContent className="picker-panel period-picker-submenu" onKeyDown={event => event.stopPropagation()} onEscapeKeyDown={event => {
          event.preventDefault(); event.stopPropagation()
          setPickerOpen(false)
          pickerTrigger.current?.focus({ preventScroll: true })
        }}>
          <PeriodPickerPanel menu period={periods.period} current={periods.current} calendar={periods.calendar} today={periods.today} busy={disabled} choose={target => {
            if (target.id !== item.placement.periodId) move({ kind: 'date', startDate: target.startDate })
          }} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator /></>}
      {focus && <><ContextMenuItem disabled={disabled} onSelect={focus.run}><Icon name="star" size={16} /><span className="context-menu-label">{focus.on ? t.focusClear(t.focusName[focus.scope]) : t.focusSet(t.focusName[focus.scope])}</span></ContextMenuItem>
      <ContextMenuSeparator /></>}
      <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; onNest() }}><Icon name="split" size={16} /><span>{nestingText().nest}</span></ContextMenuItem>
      {item.placement.nestingParentId && <ContextMenuItem disabled={disabled} onSelect={() => void submit({ type: 'unnest', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version })}><Icon name="forward" size={16} /><span>{nestingText().unnest}</span></ContextMenuItem>}
      <ContextMenuSeparator />
      {assist && <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; assist() }}><Icon name="smart" size={16} /><span className="context-menu-label">{assistanceMessages().title}</span></ContextMenuItem>}
      {decompose && <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; decompose() }}><Icon name="smart" size={16} /><span className="context-menu-label">{t.menuDecompose}</span></ContextMenuItem>}
      {item.placement.horizon !== 'later' && !item.placement.nestingParentId && <ContextMenuItem disabled={disabled} onSelect={() => { selecting.current = true; select(item.id) }}><Icon name="split" size={16} /><span className="context-menu-label">{t.menuLinkParent}</span></ContextMenuItem>}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={disabled} onSelect={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: item.status === 'done' ? 'todo' : 'done' })}><Icon name="check" size={16} /><span className="context-menu-label">{item.status === 'done' ? messages.reopenAction : t.menuComplete}</span></ContextMenuItem>
      <ContextMenuItem className="danger" disabled={disabled} onSelect={() => {
        if (relations && !window.confirm(messages.deletePreview(relations))) return
        void submit({ type: 'delete', itemId: item.id, expectedVersion: item.version })
      }}><Icon name="delete" size={16} /><span className="context-menu-label">{t.menuDelete}</span></ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
}
