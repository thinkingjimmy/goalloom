/**
 * [INPUT]: IANA timezone, candidates, selection callback and optional compact/display/disabled presentation; shared Popover, fields and menu styles.
 * [OUTPUT]: Searchable timezone selection; compact mode uses a floating menu and caller-localized city text. Offsets are computed only while open.
 * [POS]: Shared setup timezone control; constrains selection to known zones and uses the application menu style.
 */
import { menuStyles } from '../../components/ui/menu'
import { cn } from '../../lib/utils'
import { Input } from '../../components/ui/fields'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { messages } from '../../i18n'
import { Popover } from '../../components/Popover'
import { gmtOffset } from '../../lib/timezones'
import { Icon } from '../../components/icons'

export function TimezoneSelect({ value, zones, onChange, labelId, describedBy, className, compact = false, displayValue, disabled = false }: { value: string; zones: string[]; onChange: (zone: string) => void; labelId: string; describedBy?: string; className?: string; compact?: boolean; displayValue?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()
  const options = useMemo(() => open ? zones.map(zone => ({ zone, offset: gmtOffset(zone), search: zone.replaceAll('_', ' ').toLowerCase() })) : [], [zones, open])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replaceAll('_', ' ')
    return needle ? options.filter(option => option.search.includes(needle) || option.offset.toLowerCase().includes(needle)) : options
  }, [options, query])

  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, matches])

  const show = () => {
    setQuery('')
    setActive(Math.max(0, zones.indexOf(value)))
    setOpen(true)
  }
  const close = () => { setOpen(false); trigger.current?.focus() }
  const choose = (zone: string) => { onChange(zone); close() }

  return <Popover open={open} onClose={() => setOpen(false)} floating={compact} className={compact ? 'timezone-popover calendar-timezone-popover' : 'timezone-popover'} anchor={
    <button ref={trigger} type="button" className={cn(className ? `select-trigger ${className}` : 'select-trigger', 'w-full flex items-center gap-2.5 px-3 py-[9px] border border-border rounded-control bg-raised text-foreground text-[14px] font-normal text-left hover:border-[var(--edit-line,var(--line))]')} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={labelId} aria-describedby={describedBy}
      disabled={disabled} onClick={() => open ? close() : show()}
      onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); show() } }}>
      <span className={cn('select-value', 'flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis')}>{displayValue ?? value}</span>
      {!compact && <span className="select-hint">{gmtOffset(value)}</span>}
      {compact ? <span className="select-icon"><Icon name="expand" size={16} /></span> : <Icon name="expand" size={16} />}
    </button>
  }>
    <div className={cn(menuStyles.surface, 'menu timezone-menu')}>
      <Input className="menu-search" autoFocus value={query} placeholder={messages.searchTimezones} aria-label={messages.searchTimezones}
        role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
        onChange={event => { setQuery(event.target.value); setActive(0) }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(matches.length - 1, index + 1)) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
          if (event.key === 'Enter') { event.preventDefault(); const match = matches[active]; if (match) choose(match.zone) }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
          if (event.key === 'Tab') setOpen(false)
        }} />
      <div ref={list} id={listId} className="timezone-list" role="listbox" aria-labelledby={labelId}>
        {matches.map((option, index) => <div key={option.zone} id={`${listId}-${index}`} data-index={index} role="option" aria-selected={option.zone === value}
          className={cn(menuStyles.item, `menu-item ${index === active ? 'menu-item-active' : ''}`)}
          onMouseMove={() => { if (index !== active) setActive(index) }} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.zone)}>
          <span className={cn(menuStyles.check, 'menu-check')}>{option.zone === value && <Icon name="check" size={14} />}</span>
          <span className={cn(menuStyles.text, 'menu-text')}>{option.zone.replaceAll('_', ' ')}</span>
          <span className={cn(menuStyles.hint, 'menu-hint')}>{option.offset}</span>
        </div>)}
        {matches.length === 0 && <p className="menu-note">{messages.noTimezoneMatch}</p>}
      </div>
    </div>
  </Popover>
}
