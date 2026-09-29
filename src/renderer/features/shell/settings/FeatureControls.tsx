/**
 * [INPUT]: useAi 状态与动作、功能名（smart / insight）、图标与跳转到其他设置分类的回调。
 * [OUTPUT]: FeatureHero（功能总开关状态卡：已启用/需处理/已暂停/未启用，没有可用服务时引导添加）与 ProviderChoice（只列出能运行该功能模型的服务，单选切换，未就绪的服务可添加或重测）。
 * [POS]: 「设置 › 智能输入」与「设置 › 洞察」共用的顶部控件，两页结构保持一致；Key 与服务本身只在「AI 服务」里管理。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { featureCapability, providerModels } from '../../../../shared/contracts/values'
import type { AiFeature, AiProvider } from '../../../../shared/contracts/smart-input'
import { providerNames, smartMessages as t } from '../../../i18n'
import { canServe, capableProviders, providerIssue, type Ai, type ProviderIssue } from '../../../state/ai'
import { Icon, type IconName } from '../../../components/icons'
import { SettingsGroup, Switch } from './parts'
import type { Section } from './Settings'

export const issueText = (issue: ProviderIssue): string => issue.kind === 'failure' ? issue.failure.message : issue.state === 'unreadable' ? t.unreadableKey : t.unavailableKey

export function FeatureHero({ ai, feature, label, icon, goto }: { ai: Ai; feature: AiFeature; label: string; icon: IconName; goto: (section: Section) => void }) {
  const status = ai.status!, setting = status.features[feature], provider = setting.provider
  const available = capableProviders(feature).filter(value => canServe(status, value, feature))
  const issue = provider && setting.enabled ? providerIssue(status, provider) : null
  const cooldown = provider && setting.enabled ? status.providers[provider].cooldownUntil : null
  const state = setting.enabled ? issue ? 'paused' : 'enabled' : setting.paused ? 'paused' : 'disabled'
  const off = feature === 'smart' ? t.disabled : t.insightOff
  const title = setting.enabled ? issue ? t.blocked(providerNames[provider!]) : t.enabledBy(providerNames[provider!]) : setting.paused ? t.paused : off
  const note = issue ? <>{issueText(issue)} <button type="button" className="text-button small" onClick={() => goto('ai')}>{t.resolve}</button></>
    : setting.enabled ? cooldown ? t.cooldown(new Date(cooldown).toLocaleTimeString()) : t.enabledNote
    : setting.paused ? t.pausedNote : available.length ? t.offNote : t.needService(feature)
  // Turning on keeps the chosen provider while it can still serve, otherwise takes the first one that can.
  const toggle = (on: boolean) => void ai.setFeature(feature, on && !(provider && canServe(status, provider, feature)) ? available[0] ?? null : provider, on)
  return <div className="settings-hero" data-state={state}>
    <span className="settings-hero-icon" aria-hidden="true"><Icon name={state === 'paused' ? 'warning' : icon} size={20} /></span>
    <div className="settings-row-text"><span>{title}</span><small>{note}</small></div>
    {available.length || setting.enabled
      ? <Switch label={label} checked={setting.enabled} onChange={toggle} />
      : <button type="button" className="settings-button primary" onClick={() => goto('ai')}>{t.addService}</button>}
  </div>
}

export function ProviderChoice({ ai, feature, goto }: { ai: Ai; feature: AiFeature; goto: (section: Section) => void }) {
  const status = ai.status!, setting = status.features[feature], capability = featureCapability[feature]
  const pick = (provider: AiProvider) => { if (provider !== setting.provider) void ai.setFeature(feature, provider, setting.enabled) }
  return <SettingsGroup title={t.processing} aside={<button type="button" className="settings-button link" onClick={() => goto('ai')}>{t.manage}</button>}>
    <div role="radiogroup" aria-label={t.processing} className="provider-choices">
      {capableProviders(feature).map(provider => {
        const ready = canServe(status, provider, feature), current = setting.provider === provider, missing = status.providers[provider].credential === 'missing'
        return <div key={provider} className="settings-row provider-choice" data-ready={ready}>
          <button type="button" role="radio" aria-checked={current} disabled={!ready} onClick={() => pick(provider)}>
            <span className="settings-radio" data-checked={current} aria-hidden="true" />
            <span className="settings-row-text"><span>{providerNames[provider]}{current && <span className="settings-tag">{t.current}</span>}</span>
              <small>{ready ? `${t.capabilityNames[capability]} · ${(providerModels[provider] as Record<string, string>)[capability]}` : missing ? t.notAdded : t.needsAttention}</small></span>
          </button>
          {!ready && (missing
            ? <button type="button" className="settings-button" onClick={() => goto('ai')}>{t.addKey}</button>
            : <button type="button" className="settings-button" onClick={() => void ai.connect(provider, null)}>{t.retest}</button>)}
        </div>
      })}
    </div>
    <p className="settings-card-foot"><span>{t.onlyCapable(feature)}</span></p>
  </SettingsGroup>
}
