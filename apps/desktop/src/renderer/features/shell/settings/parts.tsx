/**
 * [INPUT]: Localized group/row content, controlled choices, shared switch and optional workspace timezone.
 * [OUTPUT]: SettingsGroup, SettingsRow, Segmented, ToggleChips, Switch, stamp and relativeDay.
 * [POS]: Stateless settings composition; Tailwind owns layout, feature CSS owns state and content skins.
 */
import { cn } from '../../../lib/utils'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { Switch as SwitchControl } from '../../../components/ui/switch'
import { Icon } from '../../../components/icons'

/** A group reads as a small heading (with an optional note or action on the right) above a card that holds only content. */
export function SettingsGroup({ title, aside, danger = false, reveal = false, ref, children }: { title?: string; aside?: ReactNode; danger?: boolean; reveal?: boolean; ref?: Ref<HTMLElement>; children?: ReactNode }) {
  return <section ref={ref} className="settings-group shrink-0 flex flex-col gap-2" data-danger={danger} data-reveal={reveal || undefined}>
    {(title || aside) && <header className="settings-group-header flex items-baseline justify-between gap-3 px-0.5 py-0">{title && <h3>{title}</h3>}{aside}</header>}
    <div className="settings-card flex flex-col rounded-settings-card bg-raised shadow-settings-card">{children}</div>
  </section>
}

/** `below` holds a full-width control under the title line, for choices too wide to sit on the right. */
export function SettingsRow({ title, note, children, below, dimmed = false, className }: { title: ReactNode; note?: ReactNode; children?: ReactNode; below?: ReactNode; dimmed?: boolean; className?: string }) {
  const line = <><div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{title}</span>{note && <small>{note}</small>}</div>{children}</>
  const row = cn('settings-row', 'min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4', className)
  return below
    ? <div className={cn(`${row} settings-row-stacked`, 'pt-3.5 pb-3.5 flex-col items-stretch gap-3')} data-dimmed={dimmed}><div className="settings-row-line flex items-center gap-4">{line}</div>{below}</div>
    : <div className={row} data-dimmed={dimmed}>{line}</div>
}

export interface SegmentOption<T extends string> { value: T; label: string; swatch?: string; swatchStyle?: CSSProperties | undefined; count?: number | undefined }
export function Segmented<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: readonly SegmentOption<T>[]; disabled?: boolean; onChange: (value: T) => void }) {
  return <div className="segmented inline-flex gap-0.5 rounded-[9px] bg-hover p-[3px]" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" className="inline-flex h-7 items-center gap-[7px] rounded-[7px] px-3 text-[13px] text-muted-foreground aria-checked:bg-raised aria-checked:text-foreground aria-checked:shadow-[0_1px_2px_rgba(60,40,20,.1)]" aria-checked={value === option.value} disabled={disabled} onClick={() => { if (value !== option.value) onChange(option.value) }}>
      {option.swatch && <span className="segmented-swatch" data-swatch={option.swatch} style={option.swatchStyle} aria-hidden="true" />}
      {option.label}
      {option.count !== undefined && <span className="segmented-count tabular text-[11.5px] text-muted-foreground" aria-hidden="true">{option.count}</span>}
    </button>)}
  </div>
}

/** Independent on/off choices shown as pressed buttons, unlike Segmented's single choice. */
export function ToggleChips<T extends string>({ label, options, disabled, onToggle }: { label: string; options: readonly { value: T; label: string; pressed: boolean }[]; disabled?: boolean; onToggle: (value: T, pressed: boolean) => void }) {
  return <div className="toggle-chips flex flex-wrap gap-1.5" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" className="toggle-chip h-7.5 px-3 py-0 inline-flex items-center gap-1.5 rounded-[8px] text-[13px] text-muted-foreground" aria-pressed={option.pressed} disabled={disabled} onClick={() => onToggle(option.value, !option.pressed)}>
      {option.pressed && <Icon name="check" size={12} strokeWidth={2.4} />}{option.label}
    </button>)}
  </div>
}

export function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <SwitchControl aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
}

/** Formats an instant as `YYYY-MM-DD HH:mm` in the workspace time zone so backup times match the board's day boundary. */
export function stamp(instant: string, timezone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant))
}

/** 今天 / 昨天 / YYYY-MM-DD for an instant, judged by the workspace day (plain date when there is none yet). */
export function relativeDay(instant: string, today: string, timezone: string | undefined, labels: { today: string; yesterday: string }): string {
  const day = stamp(instant, timezone).slice(0, 10)
  // Before the calendar is confirmed (e.g. right after a reset) there is no workspace day to compare with.
  if (!today) return day
  if (day === today) return labels.today
  const previous = new Date(`${today}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return day === previous.toISOString().slice(0, 10) ? labels.yesterday : day
}
