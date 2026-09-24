/**
 * [INPUT]: 分组标题/右侧说明或操作、行标题/说明与右侧控件、可选色块的分段选项；可选工作区时区。
 * [OUTPUT]: SettingsGroup（小标题在卡外、卡片只装内容）、SettingsRow 左文右控行、Segmented 分段选择（可带色块示意）、Switch 开关、stamp 本地时间格式。
 * [POS]: settings 各分类面板共用的版式原语，不持有状态、不提交命令。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CSSProperties, ReactNode } from 'react'

/** A group reads as a small heading (with an optional note or action on the right) above a card that holds only content. */
export function SettingsGroup({ title, aside, danger = false, children }: { title?: string; aside?: ReactNode; danger?: boolean; children?: ReactNode }) {
  return <section className="settings-group" data-danger={danger}>
    {(title || aside) && <header className="settings-group-header">{title && <h3>{title}</h3>}{aside}</header>}
    <div className="settings-card">{children}</div>
  </section>
}

export function SettingsRow({ title, note, children, dimmed = false }: { title: ReactNode; note?: ReactNode; children?: ReactNode; dimmed?: boolean }) {
  return <div className="settings-row" data-dimmed={dimmed}>
    <div className="settings-row-text"><span>{title}</span>{note && <small>{note}</small>}</div>
    {children}
  </div>
}

export interface SegmentOption<T extends string> { value: T; label: string; swatch?: string; swatchStyle?: CSSProperties | undefined; count?: number | undefined }
export function Segmented<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: readonly SegmentOption<T>[]; disabled?: boolean; onChange: (value: T) => void }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} onClick={() => { if (value !== option.value) onChange(option.value) }}>
      {option.swatch && <span className="segmented-swatch" data-swatch={option.swatch} style={option.swatchStyle} aria-hidden="true" />}
      {option.label}
      {option.count !== undefined && <span className="segmented-count tabular" aria-hidden="true">{option.count}</span>}
    </button>)}
  </div>
}

export function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
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
