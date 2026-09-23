/**
 * [INPUT]: 分组标题、行标题/说明与右侧控件；可选工作区时区。
 * [OUTPUT]: SettingsGroup 圆角分组、SettingsRow 左文右控行、Segmented 分段选择、stamp 本地时间格式。
 * [POS]: settings 各分类面板共用的版式原语，不持有状态、不提交命令。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ReactNode } from 'react'

export function SettingsGroup({ title, footnote, danger = false, children }: { title: string; footnote?: ReactNode; danger?: boolean; children: ReactNode }) {
  return <section className="settings-group">
    <h3 className={danger ? 'danger' : undefined}>{title}</h3>
    <div className={`settings-card ${danger ? 'danger' : ''}`}>{children}</div>
    {footnote && <p className="settings-footnote">{footnote}</p>}
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
