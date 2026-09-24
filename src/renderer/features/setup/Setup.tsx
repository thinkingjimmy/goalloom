/**
 * [INPUT]: 确认回调（日历 + 可选方向）与忙碌状态；本机检测到的时区。
 * [OUTPUT]: 首次配置的前两步：写方向 → 确认日历；方向与日历草稿在两步之间保留。
 * [POS]: features/setup 的入口视图，被 App 在日历未确认时渲染；确认只锁定日历，方向由 App 在确认成功后作为普通条目创建，Jev 步骤由 App 接续。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useMemo, useState } from 'react'
import { CalendarStep, type CalendarChoice, type CalendarDraft } from './CalendarStep'
import { DirectionStep } from './DirectionStep'

export type { CalendarChoice } from './CalendarStep'

export function Setup({ confirm, busy }: { confirm: (calendar: CalendarChoice, direction: string) => void; busy: boolean }) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const zones = useMemo(() => [...new Set(['UTC', detected, ...Intl.supportedValuesOf('timeZone')])], [detected])
  const [step, setStep] = useState<'direction' | 'calendar'>('direction')
  const [text, setText] = useState(''), [direction, setDirection] = useState('')
  const [draft, setDraft] = useState<CalendarDraft>({ timezone: detected, weekStart: 1, anchorMode: 'today', customAnchor: '' })
  return step === 'direction'
    ? <DirectionStep value={text} change={setText} next={value => { setDirection(value); setStep('calendar') }} />
    : <CalendarStep draft={draft} change={patch => setDraft(current => ({ ...current, ...patch }))} direction={direction} zones={zones} busy={busy}
      back={() => setStep('direction')} confirm={calendar => confirm(calendar, direction)} />
}
