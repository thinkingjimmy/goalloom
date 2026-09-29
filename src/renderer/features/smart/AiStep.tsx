/**
 * [INPUT]: useAi 与进入看板回调；setup 的 OnboardingFrame；ProviderConnect 表单与 JevDemo 预设示例。
 * [OUTPUT]: 首次流程第 3 步（可选）：先看预设示例（「连接 AI 服务」「暂时跳过」）；选择连接后在服务卡片里选一个服务并填 Key（卡片标出它能开启智能输入、洞察中的哪些）；测试通过后显示实际开启的功能，再进入看板。任何时候都可跳过。
 * [POS]: 日历确认之后、看板之前；不注册、不购买、不强制 Key，不影响日历锁定；示例不调用服务、不生成任务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
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

export function AiStep({ ai, finish }: { ai: Ai; finish: () => void }) {
  const [view, setView] = useState<'demo' | 'connect' | 'done'>('demo')
  const [provider, setProvider] = useState<AiProvider>(aiProviders[0])
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  // The connect form's submit button lives in the page footer, next to the other step actions.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const names: Record<AiFeature, string> = { smart: t.sectionTitle, insight: insightMessages.settingsSection }
  const skip = <Button type="button" variant="ghost" onClick={finish}>{t.skip}</Button>

  if (view === 'done' && outcome) return <OnboardingFrame step={2} label={messages.stepAi} note={t.doneFootnote} actions={<Button type="button" onClick={finish}>{t.enterBoard}</Button>}>
    <div className="onboarding-split">
      <section className="onboarding-lead">
        <p className="onboarding-eyebrow">{t.aiEyebrow}</p>
        <h1 className="onboarding-title small">{t.doneTitle(providerNames[provider])}</h1>
        <p className="onboarding-body">{t.doneBody}</p>
      </section>
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
    </div>
  </OnboardingFrame>

  const connecting = view === 'connect'
  return <OnboardingFrame step={2} label={messages.stepAi} actionsRef={setSlot}
    note={connecting ? t.connectFootnote : t.demoFootnote}
    actions={connecting
      ? <><Button type="button" variant="ghost" onClick={() => setView('demo')}>{t.backToDemo}</Button>{skip}</>
      : <>{skip}<Button type="button" onClick={() => setView('connect')}>{t.connect}</Button></>}>
    <div className="onboarding-split">
      <section className="onboarding-lead">
        <p className="onboarding-eyebrow">{connecting ? t.aiEyebrow : t.sectionTitle}</p>
        <h1 className="onboarding-title small">{connecting ? t.connectTitle : t.introTitle}</h1>
        {connecting ? <>
          <p className="onboarding-body">{t.connectBody}</p>
          <ul className="ai-capabilities">
            {aiFeatures.map(feature => <li key={feature}><span aria-hidden="true"><Icon name={feature === 'smart' ? 'smart' : 'split'} size={16} /></span><div><b>{names[feature]}</b><small>{t.capabilityPitch[feature]}</small></div></li>)}
          </ul>
        </> : <>
          <ol className="jev-points">{t.demoPoints.map(point => <li key={point}>{point}</li>)}</ol>
          <p className="onboarding-hint">{t.demoNote}</p>
        </>}
      </section>
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
