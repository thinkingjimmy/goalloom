/**
 * [INPUT]: 当前时区、候选 IANA 时区列表与选择回调；依赖 Popover 与 Icon。
 * [OUTPUT]: 只能从列表中选择的时区下拉：按钮触发、浮层内搜索、方向键/Enter 选择，附 GMT 偏移提示。
 * [POS]: setup 的时区字段，替代原生 datalist，避免输入任意文本和系统下拉样式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { messages } from '../../i18n'
import { Popover } from '../../components/Popover'
import { gmtOffset } from '../../lib/timezones'
import { Icon } from '../../components/icons'

export function TimezoneSelect({ value, zones, onChange, labelId, describedBy }: { value: string; zones: string[]; onChange: (zone: string) => void; labelId: string; describedBy?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()
  const options = useMemo(() => zones.map(zone => ({ zone, offset: gmtOffset(zone), search: zone.replaceAll('_', ' ').toLowerCase() })), [zones])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replaceAll('_', ' ')
    return needle ? options.filter(option => option.search.includes(needle) || option.offset.toLowerCase().includes(needle)) : options
  }, [options, query])

  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, matches])

  const show = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex(option => option.zone === value)))
    setOpen(true)
  }
  const close = () => { setOpen(false); trigger.current?.focus() }
  const choose = (zone: string) => { onChange(zone); close() }

  return <Popover open={open} onClose={() => setOpen(false)} className="timezone-popover" anchor={
    <button ref={trigger} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={labelId} aria-describedby={describedBy}
      onClick={() => open ? close() : show()}
      onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); show() } }}>
      <span className="select-value">{value}</span>
      <span className="select-hint">{gmtOffset(value)}</span>
      <Icon name="expand" size={16} />
    </button>
  }>
    <div className="menu timezone-menu">
      <input className="menu-search" autoFocus value={query} placeholder={messages.searchTimezones} aria-label={messages.searchTimezones}
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
          className={`menu-item ${index === active ? 'menu-item-active' : ''}`}
          onMouseMove={() => { if (index !== active) setActive(index) }} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.zone)}>
          <span className="menu-check">{option.zone === value && <Icon name="check" size={14} />}</span>
          <span className="menu-text">{option.zone.replaceAll('_', ' ')}</span>
          <span className="menu-hint">{option.offset}</span>
        </div>)}
        {matches.length === 0 && <p className="menu-note">{messages.noTimezoneMatch}</p>}
      </div>
    </div>
  </Popover>
}
