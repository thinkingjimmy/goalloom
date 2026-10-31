/**
 * [INPUT]: Device automatic-placement, completed-task layout and celebration preferences.
 * [OUTPUT]: Automatic-placement/completed-task switches without task writes and per-column confetti controls with a preview.
 * [POS]: Workspace navigation's board pane. Ordering and completion feedback sync between computers.
 */
import { SettingsButton } from '../../../components/ui/button'
import { horizons } from '../../../../shared/contracts/values'
import { horizonNames, settingsMessages as t, useLocale } from '../../../i18n'
import { Icon } from '../../../components/icons'
import { previewCelebration, useCelebration, useReducedMotion } from '../../../state/celebration'
import { setParentOrder, useParentOrder } from '../../../state/parent-order'
import { setCollapseCompleted, useCollapseCompleted } from '../../../state/completed-layout'
import { SettingsGroup, SettingsRow, Switch, ToggleChips } from './parts'

export function BoardPane({ disabled }: { disabled: boolean }) {
  useLocale()
  const order = useParentOrder(), celebration = useCelebration(), reducedMotion = useReducedMotion()
  const collapseCompleted = useCollapseCompleted()
  const anyCelebration = horizons.some(horizon => celebration.enabled[horizon])
  return <SettingsGroup>
    <SettingsRow title={t.parentOrder} note={t.parentOrderNote}>
      <Switch label={t.parentOrder} checked={order.enabled} disabled={disabled} onChange={setParentOrder} />
    </SettingsRow>
    <SettingsRow title={t.collapseCompleted} note={t.collapseCompletedNote}>
      <Switch label={t.collapseCompleted} checked={collapseCompleted} disabled={disabled} onChange={setCollapseCompleted} />
    </SettingsRow>
    <SettingsRow title={t.celebration} note={anyCelebration ? t.celebrationNote : t.celebrationOff} below={<>
      <div className="celebration-chips"><ToggleChips label={t.celebrationColumns} options={horizons.map(horizon => ({ value: horizon, label: horizonNames[horizon], pressed: celebration.enabled[horizon] }))} onToggle={celebration.setEnabled} /></div>
      {reducedMotion && <p className="settings-row-status m-0 flex items-center gap-1.5 text-[12px] leading-[1.5] text-warning" role="status"><Icon name="info" size={14} />{t.celebrationReducedMotion}</p>}
    </>}>
      <SettingsButton variant="subtle" type="button" disabled={reducedMotion} onClick={previewCelebration}><Icon name="confetti" size={14} />{t.celebrationTry}</SettingsButton>
    </SettingsRow>
  </SettingsGroup>
}
