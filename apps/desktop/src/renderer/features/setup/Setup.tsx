/**
 * [INPUT]: Guarded setup confirmation, write feedback and device timezone.
 * [OUTPUT]: Calendar selection followed by annual direction/explicit confirmation; drafts survive back, locale and stale dates.
 * [POS]: Setup session owner; App creates the optional direction separately and continues to AI setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { CalendarStep } from './CalendarStep'
import { DirectionStep } from './DirectionStep'
import { useSetupCalendar, type CalendarChoice, type CalendarDraft } from './use-setup-calendar'

export type { CalendarChoice } from './use-setup-calendar'
export function Setup({ confirm, busy, errorCode }: { confirm: (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => void; busy: boolean; errorCode: string | null }) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const zones = useMemo(() => [...new Set(['UTC', detected, ...Intl.supportedValuesOf('timeZone')])], [detected])
  const [step, setStep] = useState<'calendar' | 'direction'>('calendar')
  const [text, setText] = useState('')
  const [useCurrentYear, setUseCurrentYear] = useState(false)
  const [draft, setDraft] = useState<CalendarDraft>({ mode: 'rolling', timezone: detected, weekStart: 1, anchorMode: 'today', customAnchor: '' })
  const live = useSetupCalendar(draft)
  useEffect(() => { if (errorCode === 'stale_preview') live.refresh() }, [errorCode, live.refresh])
  return step === 'calendar'
    ? <CalendarStep draft={draft} change={patch => setDraft(current => ({ ...current, ...patch }))} live={live} zones={zones} busy={busy} next={() => setStep('direction')} />
    : <DirectionStep useCurrent={useCurrentYear} setUseCurrent={setUseCurrentYear} value={text} change={setText} live={live} busy={busy} back={() => setStep('calendar')} confirm={period => confirm(live.choice, text.trim(), period)} />
}
