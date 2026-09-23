/**
 * [INPUT]: 工作区的明暗与风格偏好、受限提交与禁用状态。
 * [OUTPUT]: 风格预览卡（纸感/简约）+ 明暗分段（跟随系统/浅色/深色），选择即提交 preferences。
 * [POS]: settings 的外观分类；两项偏好相互独立，只影响本机显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Workspace } from '../../../../shared/contracts/entities'
import { messages } from '../../../i18n/messages'
import type { Action } from '../../../state/use-workspace'
import { Segmented, SettingsGroup, SettingsRow } from './parts'

type Style = Workspace['style']
const styles: { value: Style; label: string; note: string }[] = [
  { value: 'paper', label: messages.paperStyle, note: messages.paperStyleNote },
  { value: 'minimal', label: messages.minimalStyle, note: messages.minimalStyleNote },
]
const themes = [{ value: 'system', label: messages.systemTheme }, { value: 'light', label: messages.lightTheme }, { value: 'dark', label: messages.darkTheme }] as const

export function AppearancePane({ workspace, disabled, submit }: { workspace: Workspace; disabled: boolean; submit: (action: Action) => Promise<unknown> }) {
  return <>
    <section className="settings-group">
      <h3>{messages.style}</h3>
      <div className="style-cards" role="radiogroup" aria-label={messages.style}>
        {styles.map(option => <button key={option.value} type="button" role="radio" className="style-card" aria-checked={workspace.style === option.value} disabled={disabled}
          onClick={() => { if (workspace.style !== option.value) void submit({ type: 'preferences', style: option.value }) }}>
          {/* Each preview carries its own style so both looks stay visible whatever is active. */}
          <span className="style-preview" data-preview={option.value} aria-hidden="true">
            <span className="style-preview-bar"><i /><i /><b /></span>
            {[62, 44, 70].map(width => <span key={width} className="style-preview-row"><s /><i style={{ width: `${width}%` }} /></span>)}
          </span>
          <span className="style-card-label"><span>{option.label}</span><small>{option.note}</small></span>
        </button>)}
      </div>
    </section>
    <SettingsGroup title={messages.theme} footnote={messages.themeNote}>
      <SettingsRow title={messages.themeMode} note={messages.themeModeNote}>
        <Segmented label={messages.themeMode} value={workspace.theme} options={themes} disabled={disabled} onChange={theme => void submit({ type: 'preferences', theme })} />
      </SettingsRow>
    </SettingsGroup>
  </>
}
