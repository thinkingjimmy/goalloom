/**
 * [INPUT]: AI configuration, direction-write pending state, onboarding frame and provider connection forms.
 * [OUTPUT]: Optional third setup step laid out like the others (title block on top, explanation beside the demo or provider cards), explicit connection and a guarded board entry.
 * [POS]: Follows calendar confirmation; the local demo creates no tasks and needs no service.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { aiFeatures, aiProviders, featureCapability, providerCapabilities, providerModels } from '../../../shared/contracts/values'
import type { AiFeature, AiProvider, TestOutcome } from '../../../shared/contracts/smart-input'
import { insightMessages, messages, providerNames, smartMessages as t } from '../../i18n'
import type { Ai } from '../../state/ai'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { OnboardingFrame } from '../setup/OnboardingFrame'
import { ProviderConnect } from './ProviderConnect'
import { JevDemo } from './JevDemo'

const serves = (provider: AiProvider, feature: AiFeature) => providerCapabilities[provider].includes(featureCapability[feature])

export function AiStep({ ai, finish, busy = false }: { ai: Ai; finish: () => void; busy?: boolean }) {
  const [view, setView] = useState<'demo' | 'connect' | 'done'>('demo')
  const [provider, setProvider] = useState<AiProvider>(aiProviders[0])
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  // The connect form's submit button lives in the page footer, next to the other step actions.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const names: Record<AiFeature, string> = { smart: t.sectionTitle, insight: insightMessages.settingsSection }
  const skip = <Button type="button" variant="ghost" disabled={busy} onClick={finish}>{t.skip}</Button>

  if (view === 'done' && outcome) return <OnboardingFrame step={2} label={messages.stepAi} note={t.doneFootnote} actions={<Button type="button" disabled={busy} onClick={finish}>{t.enterBoard}</Button>}>
    <header className="onboarding-intro">
      <p className="onboarding-eyebrow">{t.aiEyebrow}</p>
      <h1 className="onboarding-title">{t.doneTitle(providerNames[provider])}</h1>
      <p className="onboarding-subtitle">{t.doneBody}</p>
    </header>
    <ul className="ai-results" aria-label={t.aiSection}>
      {aiFeatures.map(feature => {
        const on = outcome.enabled.includes(feature) || ai.status?.features[feature].enabled, capability = featureCapability[feature]
        const reason = !serves(provider, feature) ? t.insightNeedsChat : outcome.results[capability]?.failure?.message ?? null
        return <li key={feature} data-on={!!on}>
          <span className="ai-result-mark" aria-hidden="true">{on && <Icon name="check" size={14} strokeWidth={2.4} />}</span>
          <div><b>{on ? t.featureOn(names[feature]) : t.featureOff(names[feature])}</b>
            <small>{on ? `${t.capabilityNames[capability]} · ${(providerModels[provider] as Record<string, string>)[capability]}` : reason}</small></div>
        </li>
      })}
    </ul>
  </OnboardingFrame>

  const connecting = view === 'connect'
  return <OnboardingFrame step={2} label={messages.stepAi} actionsRef={setSlot}
    note={connecting ? t.connectFootnote : t.demoFootnote}
    actions={connecting
      ? <><Button type="button" variant="ghost" onClick={() => setView('demo')}>{t.backToDemo}</Button>{skip}</>
      : <>{skip}<Button type="button" onClick={() => setView('connect')}>{t.connect}</Button></>}>
    <header className="onboarding-intro">
      <p className="onboarding-eyebrow">{connecting ? t.aiEyebrow : t.sectionTitle}</p>
      <h1 className="onboarding-title">{connecting ? t.connectTitle : t.introTitle}</h1>
      <p className="onboarding-subtitle">{connecting ? t.connectBody : t.demoNote}</p>
    </header>
    <div className="onboarding-split">
      {connecting
        ? <ul className="ai-capabilities">
          {aiFeatures.map(feature => <li key={feature}><span aria-hidden="true"><Icon name={feature === 'smart' ? 'smart' : 'split'} size={16} /></span><div><b>{names[feature]}</b><small>{t.capabilityPitch[feature]}</small></div></li>)}
        </ul>
        : <ol className="jev-points">{t.demoPoints.map((point, index) => <li key={point}><span className="jev-point-mark" aria-hidden="true">{index + 1}</span>{point}</li>)}</ol>}
      {connecting
        ? <div className="ai-options" role="radiogroup" aria-label={t.providerLabel}>
          {aiProviders.map(value => {
            const selected = value === provider
            return <div key={value} className="ai-option" data-selected={selected}>
              <button type="button" role="radio" aria-checked={selected} className="ai-option-head" onClick={() => setProvider(value)}>
                <span className="ai-radio" data-checked={selected} aria-hidden="true" />
                <span className="ai-option-name"><span>{providerNames[value]}{value === aiProviders[0] && <span className="ai-option-tag">{t.recommended}</span>}</span><small>{t.providerPitch(value)}</small></span>
                <span className="ai-option-chips">{aiFeatures.map(feature => <span key={feature} className="capability-chip" data-state={serves(value, feature) ? 'ok' : 'unsupported'}>{serves(value, feature) ? '✓' : '—'} {names[feature]}</span>)}</span>
              </button>
              {selected && <div className="ai-option-form"><ProviderConnect key={value} ai={ai} provider={value} submitLabel={t.testEnable}
                done={result => { setOutcome(result); setView('done') }} actions={submit => slot && createPortal(<Button {...submit} />, slot)} /></div>}
            </div>
          })}
        </div>
        : <JevDemo />}
    </div>
  </OnboardingFrame>
}
