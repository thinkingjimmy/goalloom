/**
 * [INPUT]: 当前主题、受限提交与禁用状态。
 * [OUTPUT]: 三张主题预览卡（跟随系统/浅色/深色），选择即提交 preferences。
 * [POS]: settings 的外观分类；主题只影响本机显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from '../../../i18n/messages'
import type { Action } from '../../../state/use-workspace'

type Theme = 'system' | 'light' | 'dark'
const themes: { value: Theme; label: string }[] = [{ value: 'system', label: messages.systemTheme }, { value: 'light', label: messages.lightTheme }, { value: 'dark', label: messages.darkTheme }]

export function AppearancePane({ theme, disabled, submit }: { theme: Theme; disabled: boolean; submit: (action: Action) => Promise<unknown> }) {
  return <section className="settings-group">
    <h3>{messages.theme}</h3>
    <div className="theme-cards" role="radiogroup" aria-label={messages.theme}>
      {themes.map(option => <button key={option.value} type="button" role="radio" className="theme-card" aria-checked={theme === option.value} disabled={disabled}
        onClick={() => { if (theme !== option.value) void submit({ type: 'preferences', theme: option.value }) }}>
        <span className={`theme-preview theme-preview-${option.value}`} aria-hidden="true"><i /><i /></span>
        <span className="theme-card-label">{option.label}</span>
      </button>)}
    </div>
    <p className="settings-footnote">{messages.themeNote}</p>
  </section>
}
