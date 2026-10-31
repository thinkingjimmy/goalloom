/**
 * [INPUT]: Confirmed workspace, actual annual direction, real AI connection state and shared first-run stage.
 * [OUTPUT]: Optional feature previews, explicit BYOK connection and real per-capability results; skip always leads to the board.
 * [POS]: Final onboarding page. Read-only demos share the preceding annual canvas; ProviderConnect owns credentials and consent.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { workspaceDate } from '../../../domain/calendar'
import { aiFeatures, aiProviders, featureCapability } from '../../../shared/contracts/values'
import type { AiFeature, AiProvider, TestOutcome } from '../../../shared/contracts/smart-input'
import type { ItemDetail, Snapshot } from '../../../shared/contracts/queries'
import { insightMessages, messages, providerNames, smartMessages as t } from '../../i18n'
import type { Ai } from '../../state/ai'
import { Button, TextButton } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Icon } from '../../components/icons'
import appIcon from '../../assets/app-icon.png'
import { useOnboardingStage } from '../setup/OnboardingStage'
import { useEntryMotion, useSetupMotion } from '../setup/use-setup-motion'
import { ProviderConnect } from './ProviderConnect'
import '../setup/calendar.css'
import './ai-step.css'

type View = 'demo' | 'connect' | 'done'
const views: readonly View[] = ['demo', 'connect', 'done']
export function AiStep({ ai, finish, snapshot, direction, busy = false, keyboardEntry = false }: {
  ai: Ai; finish: () => void; snapshot: Snapshot; direction: ItemDetail | null; busy?: boolean; keyboardEntry?: boolean
}) {
  const [view, setView] = useState<View>('demo')
  const [feature, setFeature] = useState<AiFeature>('smart')
  const [provider, setProvider] = useState<AiProvider>(aiProviders[0])
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [working, setWorking] = useState(false)
  const keyboard = useRef(keyboardEntry)
  const entry = useRef(keyboardEntry ? null : 'forward' as const)
  const stage = useOnboardingStage()
  const retained = useRef(stage?.current())
  const motion = useSetupMotion(view, setView, views)
  const previousView = useRef(view)
  useEntryMotion(motion.root, entry.current)
  useLayoutEffect(() => {
    if (previousView.current !== view) motion.form.current?.querySelector<HTMLElement>(view === 'connect' ? '#onboarding-provider' : view === 'demo' ? '.ai-preview-option[aria-pressed=true]' : 'button')?.focus({ preventScroll: true })
    previousView.current = view
  }, [view, motion.form])
  const calendar = snapshot.workspace.calendar
  useLayoutEffect(() => {
    if (!calendar) return
    stage?.publish({ live: { today: workspaceDate(calendar.timezone, snapshot.observedAt), now: snapshot.observedAt, calendar, periods: snapshot.periods },
      direction: direction?.item.title ?? (busy ? retained.current?.direction ?? '' : ''),
      target: direction?.period ?? (busy ? retained.current?.target : snapshot.periods.find(period => period.horizon === 'year')),
      camera: feature })
  }, [stage, calendar, snapshot.observedAt, snapshot.periods, direction, busy, feature])
  const names: Record<AiFeature, string> = { smart: t.sectionTitle, insight: insightMessages.settingsSection }
  const navigate = (next: View, instant: boolean) => { stage?.motion(instant); motion.navigate(next, instant) }
  const back = <Button type="button" variant="outline" className="setup-back" disabled={working || busy} onClick={event => navigate('demo', event.detail === 0)}>{messages.start.back}</Button>
  const skip = <Button type="button" variant="outline" className="setup-back ai-skip" disabled={busy} onClick={finish}>{t.skip}</Button>
  return <div ref={motion.root} className="onboarding setup-entry ai-entry calendar-entry flex-1 min-h-0" data-ai-view={view}
    onPointerDownCapture={() => { keyboard.current = false }} onKeyDownCapture={() => { keyboard.current = true }}>
    <main className="setup-scroll" aria-label={messages.stepAi}>
      <div ref={motion.form} className="onboarding-content setup-form" data-entry-part="form">
        <img className="setup-logo" src={appIcon} alt="" width={64} height={64} draggable={false} />
        <h1 className="setup-title">{view === 'demo' ? t.onboardingIntroTitle : view === 'connect' ? t.onboardingConnectTitle : `${t.onboardingDonePrefix}${providerNames[provider]}.`}</h1>
        {view === 'demo' ? <>
          <section className="ai-preview-choice" aria-labelledby="ai-preview-label"><p id="ai-preview-label">{t.onboardingPreviewLabel}</p>
            <div className="ai-preview-switch" role="group" aria-labelledby="ai-preview-label">{aiFeatures.map(value => <button type="button" key={value} aria-pressed={feature === value} aria-controls="onboarding-product-preview" className="ai-preview-option" onClick={event => { stage?.motion(event.detail === 0); setFeature(value) }}><Icon name={value === 'smart' ? 'smart' : 'split'} size={16} />{names[value]}</button>)}</div>
          </section>
          <div className="setup-navigation">{skip}<Button type="button" className="calendar-primary setup-next" onClick={event => navigate('connect', event.detail === 0)}>{t.connect}</Button></div>
        </> : view === 'connect' ? <>
          <div className="ai-connect-heading"><span>{t.onboardingOwnKey}</span><TextButton type="button" disabled={busy} onClick={finish}>{t.skip}</TextButton></div>
          <label className="ai-provider-label" htmlFor="onboarding-provider">{t.providerLabel}</label>
          <Select value={provider} disabled={working} onValueChange={value => setProvider(value as AiProvider)}>
            <SelectTrigger id="onboarding-provider" className="ai-provider-select" aria-label={t.providerLabel}><SelectValue /></SelectTrigger>
            <SelectContent>{aiProviders.filter(value => value !== 'hosted').map(value => <SelectItem key={value} value={value}>{providerNames[value]}</SelectItem>)}</SelectContent>
          </Select>
          <ProviderConnect key={provider} ai={ai} provider={provider} submitLabel={t.testEnable} feedbackFirst onWorkingChange={setWorking}
            done={result => { setOutcome(result); navigate('done', keyboard.current) }}
            actions={submit => <div className="setup-navigation">{back}<Button className="calendar-primary setup-next" {...submit} disabled={busy || submit.disabled} /></div>} />
        </> : outcome && <>
          <p className="ai-done-lead">{t.onboardingDoneBody}</p>
          <ul className="ai-onboarding-results" aria-label={t.aiSection}>{aiFeatures.map(value => {
            const on = outcome.enabled.includes(value) || ai.status?.features[value].enabled
            const reason = outcome.results[featureCapability[value]]?.failure?.message ?? t.testFailed
            return <li key={value} data-on={!!on}><Icon name={on ? 'check' : 'empty'} size={16} /><span><b>{on ? t.featureOn(names[value]) : t.featureOff(names[value])}</b><small>{on ? value === 'smart' ? t.onboardingSmartDetail : t.onboardingInsightDetail : reason}</small></span></li>
          })}</ul>
          <div className="setup-navigation"><Button type="button" className="calendar-primary setup-next" disabled={busy} onClick={finish}>{t.enterBoard}</Button></div>
        </>}
      </div>
    </main>
  </div>
}
