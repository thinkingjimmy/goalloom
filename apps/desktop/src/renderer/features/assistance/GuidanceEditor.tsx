import type { GuidanceValue } from '../../../shared/contracts/assistance'
import { assistanceMessages } from '../../i18n/assistance'

export const blankGuidance = (): GuidanceValue => ({ formatVersion: 1, kind: 'next_step', nextAction: '', contextNote: null, scopeNote: null, authorship: 'user' })
export function GuidanceEditor({ value, change, disabled }: { value: GuidanceValue; change: (value: GuidanceValue) => void; disabled: boolean }) {
  const t = assistanceMessages()
  return <div className="guidance-editor">
    <label>{t.kind}<select aria-label={t.kind} value={value.kind} disabled={disabled} onChange={event => change({ ...value, kind: event.target.value as GuidanceValue['kind'] })}>
      {Object.entries(t.kinds).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}
    </select></label>
    <label>{t.nextAction}<textarea aria-label={t.nextAction} rows={3} value={value.nextAction} maxLength={600} disabled={disabled} onChange={event => change({ ...value, nextAction: event.target.value })} /></label>
    <label>{t.context}<textarea aria-label={t.context} rows={2} value={value.contextNote ?? ''} maxLength={300} disabled={disabled} onChange={event => change({ ...value, contextNote: event.target.value || null })} /></label>
    <label>{t.scope}<textarea aria-label={t.scope} rows={2} value={value.scopeNote ?? ''} maxLength={300} disabled={disabled} onChange={event => change({ ...value, scopeNote: event.target.value || null })} /></label>
    <p className="assistance-note">{value.kind === 'waiting_note' ? t.waiting : t.textOnly}</p>
  </div>
}
