/**
 * [INPUT]: 草稿截止日（YYYY-MM-DD 或空）、工作区今天与变更回调。
 * [OUTPUT]: 截止日按钮与快捷选项/日期输入/清除浮层；只改草稿，由详情统一保存。
 * [POS]: items 详情字段；截止日独立于所在列，不安排到未来周期。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import { messages } from '../../i18n'
import { addDays, monthEnd, weekday } from '../../lib/dates'
import { longDate } from '../../i18n/format'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'

export function DuePicker({ value, today, readOnly, onChange }: { value: string; today: string; readOnly: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const day = weekday(today)
  const options = [
    [messages.dueToday, today], [messages.dueTomorrow, addDays(today, 1)],
    ...(day >= 1 && day < 5 ? [[messages.dueFriday, addDays(today, 5 - day)]] : []),
    [messages.dueNextMonday, addDays(today, ((8 - day) % 7) || 7)], [messages.dueMonthEnd, monthEnd(today)],
  ] as [string, string][]
  const overdue = !!value && value < today
  const choose = (next: string) => { onChange(next); setOpen(false) }
  return <Popover open={open} onClose={() => setOpen(false)} anchor={
    <button type="button" className="field-button tabular" data-empty={!value} data-overdue={overdue} aria-label={messages.labelled(messages.dueDate, value ? longDate(value) : messages.noDue)} aria-expanded={open} disabled={readOnly} onClick={() => setOpen(!open)}>
      {value ? `${longDate(value)}${overdue ? messages.overdueSuffix : ''}` : <><Icon name="calendar" size={16} />{messages.addDue}</>}
    </button>
  }>
    <div className="menu" role="menu" aria-label={messages.dueDate}>
      {options.map(([label, date]) => <button key={label} type="button" role="menuitemradio" aria-checked={value === date} className="menu-item" onClick={() => choose(date)}>
        <span className="menu-text">{label}</span><span className="menu-hint tabular">{longDate(date)}</span>
      </button>)}
      <div className="menu-separator" />
      <label className="menu-field">{messages.pickDate}<input type="date" value={value} onChange={event => { if (event.target.value) choose(event.target.value) }} /></label>
      {value && <button type="button" role="menuitem" className="menu-item danger" onClick={() => choose('')}>{messages.clearDue}</button>}
      <p className="menu-note">{messages.dueDateNote}</p>
    </div>
  </Popover>
}
