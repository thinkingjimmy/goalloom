/**
 * [INPUT]: Workspace appearance preferences, submission controls, LanguageSelect and local relation-line preferences.
 * [OUTPUT]: Language, appearance and relation-line controls.
 * [POS]: Settings appearance pane; language and relation-line preferences remain device-local.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Workspace } from '../../../../shared/contracts/entities'
import { messages, settingsMessages as t } from '../../../i18n'
import type { Action } from '../../../state/use-workspace'
import { flowVars } from '../../../lib/colors'
import { LanguageSelect } from '../../../components/LanguageSelect'
import { useRelationLines } from '../../../state/relation-lines'
import { Segmented, SettingsGroup, SettingsRow, Switch, type SegmentOption } from './parts'

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
  const lines = useRelationLines()
  return <>
    <SettingsGroup>
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
      <SettingsRow title={t.relationLines} note={t.relationLinesNote}>
        <Switch label={t.relationLines} checked={lines.enabled} onChange={lines.setEnabled} />
      </SettingsRow>
    </SettingsGroup>
  </>
}
