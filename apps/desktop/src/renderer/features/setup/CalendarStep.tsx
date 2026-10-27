/**
 * [INPUT]: Calendar draft, live periods and non-persisting navigation callbacks.
 * [OUTPUT]: Three inline Select controls with equal-height outlined Back and green Next actions.
 * [POS]: Setup's calendar form; the persistent canvas and device timezone belong to Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { MouseEventHandler } from 'react'
import { calendarMessages as c, messages } from '../../i18n'
import { Button } from '../../components/ui/button'
import appIcon from '../../assets/app-icon.png'
import { CalendarSentence } from './CalendarSentence'
import type { CalendarDraft, useSetupCalendar } from './use-setup-calendar'

export function CalendarStep({ draft, change, live, next, busy, back }: {
  draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; live: ReturnType<typeof useSetupCalendar>; next: MouseEventHandler<HTMLButtonElement>; busy: boolean; back?: MouseEventHandler<HTMLButtonElement>
}) {
  return <section className="calendar-form" aria-labelledby="calendar-title">
    <img className="setup-logo" src={appIcon} alt="" draggable={false} />
    <h1 className="setup-title" id="calendar-title">{c.chooseCalendar}</h1>
    <CalendarSentence draft={draft} change={change} live={live} busy={busy} />
    <div className="onboarding-actions setup-navigation">
      {back && <Button variant="outline" className="setup-back calendar-back" disabled={busy} onClick={back}>{messages.start.back}</Button>}
      <Button className="calendar-primary setup-next" disabled={busy || !live.periods} onClick={next}>{messages.nextStep}</Button>
    </div>
  </section>
}
