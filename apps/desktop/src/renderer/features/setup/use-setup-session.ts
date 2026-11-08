/**
 * [INPUT]: The computer's current IANA timezone and first-run navigation.
 * [OUTPUT]: In-memory calendar and direction drafts retained across steps; device timezone refreshes on focus/wake.
 * [POS]: Setup's unconfirmed local session. Confirmed workspaces never use this state.
 */
import { useEffect, useState } from 'react'
import type { CalendarDraft } from './use-setup-calendar'

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
export function useSetupSession() {
  const [step, setStep] = useState<'calendar' | 'direction'>('calendar')
  const [text, setText] = useState('')
  const [useCurrentYear, setUseCurrentYear] = useState(false)
  const [draft, setDraft] = useState<CalendarDraft>(() => ({ mode: 'rolling', timezone: deviceTimezone(), weekStart: 1, anchorMode: 'today', customAnchor: '' }))
  useEffect(() => {
    const refresh = () => {
      const timezone = deviceTimezone()
      setDraft(current => current.timezone === timezone ? current : { ...current, timezone })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return { step, setStep, text, setText, useCurrentYear, setUseCurrentYear, draft, setDraft }
}
