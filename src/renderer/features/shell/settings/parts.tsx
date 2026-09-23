/**
 * [INPUT]: 分组标题/说明/右侧状态或操作、行标题/说明与右侧控件；可选工作区时区。
 * [OUTPUT]: SettingsGroup（标题与说明在卡片外、卡片只装内容）、SettingsRow 左文右控行、Segmented 分段选择、stamp 本地时间格式。
 * [POS]: settings 各分类面板共用的版式原语，不持有状态、不提交命令。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ReactNode } from 'react'

/** A group reads as heading + card: title, description and status sit above; the card holds only content. */
export function SettingsGroup({ title, description, aside, danger = false, children }: { title: string; description?: ReactNode; aside?: ReactNode; danger?: boolean; children?: ReactNode }) {
  return <section className={`settings-group ${danger ? 'danger' : ''}`}>
    <header className="settings-group-header">
      <div><h3>{title}</h3>{description && <div className="settings-group-description">{description}</div>}</div>
      {aside}
    </header>
    <div className={`settings-card ${danger ? 'danger' : ''}`}>{children}</div>
  </section>
}

export function SettingsRow({ title, note, children, dimmed = false }: { title: ReactNode; note?: ReactNode; children?: ReactNode; dimmed?: boolean }) {
  return <div className="settings-row" data-dimmed={dimmed}>
    <div className="settings-row-text"><span>{title}</span>{note && <small>{note}</small>}</div>
    {children}
  </div>
}

export function Segmented<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; disabled?: boolean; onChange: (value: T) => void }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} onClick={() => { if (value !== option.value) onChange(option.value) }}>{option.label}</button>)}
  </div>
}

/** Formats an instant as `YYYY-MM-DD HH:mm` in the workspace time zone so backup times match the board's day boundary. */
export function stamp(instant: string, timezone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant))
}
