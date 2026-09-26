/**
 * [INPUT]: Workspace appearance preferences and submission controls, LanguageSelect, local display stores and system motion preference.
 * [OUTPUT]: Appearance controls; completion confetti as one row with a column chip per horizon (hidden columns included) and a preview.
 * [POS]: Settings appearance pane; language, relation lines and celebration preferences remain device-local.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Workspace } from '../../../../shared/contracts/entities'
import { horizons } from '../../../../shared/contracts/values'
import { horizonNames, messages, settingsMessages as t } from '../../../i18n'
import type { Action } from '../../../state/use-workspace'
import { flowVars } from '../../../lib/colors'
import { LanguageSelect } from '../../../components/LanguageSelect'
import { useRelationLines } from '../../../state/relation-lines'
import { previewCelebration, useCelebration, useReducedMotion } from '../../../state/celebration'
import { Icon } from '../../../components/icons'
import { Segmented, SettingsGroup, SettingsRow, Switch, ToggleChips, type SegmentOption } from './parts'

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
  const celebration = useCelebration()
  const reducedMotion = useReducedMotion()
  const anyCelebration = horizons.some(horizon => celebration.enabled[horizon])
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
      <SettingsRow title={t.celebration} note={anyCelebration ? t.celebrationNote : t.celebrationOff} below={<>
        <ToggleChips label={t.celebrationColumns} options={horizons.map(horizon => ({ value: horizon, label: horizonNames[horizon], pressed: celebration.enabled[horizon] }))} onToggle={celebration.setEnabled} />
        {reducedMotion && <p className="settings-row-status" role="status"><Icon name="info" size={14} />{t.celebrationReducedMotion}</p>}
      </>}>
        <button type="button" className="settings-button subtle" disabled={reducedMotion} onClick={previewCelebration}><Icon name="confetti" size={14} />{t.celebrationTry}</button>
      </SettingsRow>
    </SettingsGroup>
  </>
}
