/**
 * [INPUT]: 工作区的明暗、风格与复选框样式偏好、受限提交与禁用状态；LanguageSelect 语言控件。
 * [OUTPUT]: 一张卡片四行：语言（跟随系统并显示系统语言/五种语言原生名，下拉即时切换）、风格（纸感/简约）、复选框（透明描边/纸白底/同色淡底）、明暗（跟随系统/浅色/深色），分段带色块示意，说明随选中项变化，外观选择即提交 preferences。
 * [POS]: settings 的外观分类；各项偏好相互独立，只影响本机显示；语言写入 main 的设备偏好而非工作区。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Workspace } from '../../../../shared/contracts/entities'
import { messages, settingsMessages as t } from '../../../i18n'
import type { Action } from '../../../state/use-workspace'
import { flowVars } from '../../../lib/colors'
import { LanguageSelect } from '../../../components/LanguageSelect'
import { Segmented, SettingsGroup, SettingsRow, type SegmentOption } from './parts'

// The checkbox swatches use the blue flow so each fill reads against a real flow ring.
const blue = flowVars([1])
// Built per render so labels follow the current language.
const styles = (): SegmentOption<Workspace['style']>[] => [
  { value: 'paper', label: messages.paperStyle, swatch: 'style-paper' },
  { value: 'minimal', label: messages.minimalStyle, swatch: 'style-minimal' },
]
const checks = (): SegmentOption<Workspace['checkStyle']>[] => [
  { value: 'outline', label: messages.outlineCheck, swatch: 'check-outline', swatchStyle: blue },
  { value: 'paper', label: messages.paperCheck, swatch: 'check-paper', swatchStyle: blue },
  { value: 'tint', label: messages.tintCheck, swatch: 'check-tint', swatchStyle: blue },
]
const themes = (): SegmentOption<Workspace['theme']>[] => [
  { value: 'system', label: messages.systemTheme, swatch: 'theme-system' },
  { value: 'light', label: messages.lightTheme, swatch: 'theme-light' },
  { value: 'dark', label: messages.darkTheme, swatch: 'theme-dark' },
]

export function AppearancePane({ workspace, disabled, submit }: { workspace: Workspace; disabled: boolean; submit: (action: Action) => Promise<unknown> }) {
  return <SettingsGroup>
    <SettingsRow title={messages.language} note={messages.languageNote}><LanguageSelect className="settings-select" /></SettingsRow>
    <SettingsRow title={messages.style} note={t.styleNotes[workspace.style]}>
      <Segmented label={messages.style} value={workspace.style} options={styles()} disabled={disabled} onChange={style => void submit({ type: 'preferences', style })} />
    </SettingsRow>
    <SettingsRow title={messages.checkStyle} note={t.checkNotes[workspace.checkStyle]}>
      <Segmented label={messages.checkStyle} value={workspace.checkStyle} options={checks()} disabled={disabled} onChange={checkStyle => void submit({ type: 'preferences', checkStyle })} />
    </SettingsRow>
    <SettingsRow title={messages.theme} note={messages.themeModeNote}>
      <Segmented label={messages.theme} value={workspace.theme} options={themes()} disabled={disabled} onChange={theme => void submit({ type: 'preferences', theme })} />
    </SettingsRow>
  </SettingsGroup>
}
