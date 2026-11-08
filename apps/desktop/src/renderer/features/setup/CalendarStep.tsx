/**
 * [INPUT]: Calendar draft, live periods, direction navigation and explicit skip confirmation.
 * [OUTPUT]: Three inline Select controls, a primary Next action and a text Skip action below it.
 * [POS]: Setup's calendar form; the persistent canvas and device timezone belong to Setup.
 */
import type { MouseEventHandler } from 'react'
import { calendarMessages as c, messages } from '../../i18n'
import { Button, TextButton } from '../../components/ui/button'
import appIcon from '../../assets/app-icon.png'
import { CalendarSentence } from './CalendarSentence'
import type { CalendarDraft, useSetupCalendar } from './use-setup-calendar'

export function CalendarStep({ draft, change, live, next, busy, skip }: {
  draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; live: ReturnType<typeof useSetupCalendar>; next: MouseEventHandler<HTMLButtonElement>; busy: boolean; skip: () => void
}) {
  return <section className="calendar-form" aria-labelledby="calendar-title">
    <img className="setup-logo" src={appIcon} alt="" draggable={false} />
    <h1 className="setup-title" id="calendar-title">{c.chooseCalendar}</h1>
    <CalendarSentence draft={draft} change={change} live={live} busy={busy} />
    <div className="onboarding-actions setup-navigation">
      <Button className="calendar-primary setup-next" disabled={busy || !live.periods} onClick={next}>{messages.nextStep}</Button>
    </div>
    <TextButton className="setup-skip mt-2 min-h-11 w-full text-center" disabled={busy || !live.periods} onClick={skip}>{messages.skipSetup}</TextButton>
  </section>
}
