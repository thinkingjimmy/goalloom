/**
 * [INPUT]: Guarded workspace submission, local parent ordering and existing celebration preferences.
 * [OUTPUT]: Board ordering switch and per-column confetti controls with a preview.
 * [POS]: Workspace navigation's board pane; both preferences stay on this device.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { horizons } from '../../../../shared/contracts/values'
import { horizonNames, settingsMessages as t, useLocale } from '../../../i18n'
import { Icon } from '../../../components/icons'
import { previewCelebration, useCelebration, useReducedMotion } from '../../../state/celebration'
import { enableParentOrder, useParentOrder } from '../../../state/parent-order'
import type { Action } from '../../../state/use-workspace'
import { SettingsGroup, SettingsRow, Switch, ToggleChips } from './parts'

export function BoardPane({ disabled, submit }: { disabled: boolean; submit: (action: Action) => Promise<unknown> }) {
  useLocale()
  const order = useParentOrder(), celebration = useCelebration(), reducedMotion = useReducedMotion()
  const anyCelebration = horizons.some(horizon => celebration.enabled[horizon])
  return <SettingsGroup>
    <SettingsRow title={t.parentOrder} note={t.parentOrderNote}>
      <Switch label={t.parentOrder} checked={order.enabled || !!order.pending} disabled={disabled || !!order.pending}
        onChange={enabled => { if (enabled) enableParentOrder(); else void submit({ type: 'materializeParentOrder' }) }} />
    </SettingsRow>
    <SettingsRow title={t.celebration} note={anyCelebration ? t.celebrationNote : t.celebrationOff} below={<>
      <div className="celebration-chips"><ToggleChips label={t.celebrationColumns} options={horizons.map(horizon => ({ value: horizon, label: horizonNames[horizon], pressed: celebration.enabled[horizon] }))} onToggle={celebration.setEnabled} /></div>
      {reducedMotion && <p className="settings-row-status" role="status"><Icon name="info" size={14} />{t.celebrationReducedMotion}</p>}
    </>}>
      <button type="button" className="settings-button subtle" disabled={reducedMotion} onClick={previewCelebration}><Icon name="confetti" size={14} />{t.celebrationTry}</button>
    </SettingsRow>
  </SettingsGroup>
}
