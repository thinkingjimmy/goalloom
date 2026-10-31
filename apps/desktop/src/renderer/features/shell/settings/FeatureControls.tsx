/**
 * [INPUT]: useAi 状态与动作、功能名（smart / insight）、图标与跳转到其他设置分类的回调。
 * [OUTPUT]: FeatureHero（功能总开关状态卡：已启用/需处理/已暂停/未启用，没有可用服务时引导添加）与 ProviderChoice（只列出能运行该功能模型的服务，单选切换，未就绪的服务可添加或重测）。
 * [POS]: 「设置 › 智能输入」与「设置 › 洞察」共用的顶部控件，两页结构保持一致；Key 与服务本身只在「AI 服务」里管理。
 */
import { TextButton, SettingsButton } from '../../../components/ui/button'
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
  const note = issue ? <>{issueText(issue)} <TextButton type="button" className="small" onClick={() => goto('ai')}>{t.resolve}</TextButton></>
    : setting.enabled ? cooldown ? t.cooldown(new Date(cooldown).toLocaleTimeString()) : t.enabledNote
    : setting.paused ? t.pausedNote : available.length ? t.offNote : t.needService(feature)
  // Turning on keeps the chosen provider while it can still serve, otherwise takes the first one that can.
  const toggle = (on: boolean) => void ai.setFeature(feature, on && !(provider && canServe(status, provider, feature)) ? available[0] ?? null : provider, on)
  return <div className="settings-hero flex items-center gap-3.5 pt-4 pr-4 pb-4 pl-4.5 rounded-[12px] bg-hover" data-state={state}>
    <span className="settings-hero-icon w-9 h-9 shrink-0 grid place-items-center rounded-[10px] bg-raised text-muted-foreground" aria-hidden="true"><Icon name={state === 'paused' ? 'warning' : icon} size={20} /></span>
    <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{title}</span><small>{note}</small></div>
    {available.length || setting.enabled
      ? <Switch label={label} checked={setting.enabled} onChange={toggle} />
      : <SettingsButton variant="primary" type="button" onClick={() => goto('ai')}>{t.addService}</SettingsButton>}
  </div>
}

export function ProviderChoice({ ai, feature, goto }: { ai: Ai; feature: AiFeature; goto: (section: Section) => void }) {
  const status = ai.status!, setting = status.features[feature], capability = featureCapability[feature]
  const pick = (provider: AiProvider) => { if (provider !== setting.provider) void ai.setFeature(feature, provider, setting.enabled) }
  return <SettingsGroup title={t.processing} aside={<SettingsButton variant="link" type="button" onClick={() => goto('ai')}>{t.manage}</SettingsButton>}>
    <div role="radiogroup" aria-label={t.processing} className="provider-choices">
      {capableProviders(feature).filter(provider => provider !== 'hosted' || !!status.hostedAccountId).map(provider => {
        const ready = canServe(status, provider, feature), current = setting.provider === provider, missing = status.providers[provider].credential === 'missing'
        return <div key={provider} className="settings-row provider-choice min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4" data-ready={ready}>
          <button type="button" role="radio" aria-checked={current} disabled={!ready} onClick={() => pick(provider)}>
            <span className="settings-radio" data-checked={current} aria-hidden="true" />
            <span className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{providerNames[provider]}{current && <span className="settings-tag ml-2 h-4.5 px-1.5 py-0 inline-flex items-center rounded-[5px] bg-hover text-[11px] font-medium text-soft">{t.current}</span>}</span>
              <small>{ready ? `${t.capabilityNames[capability]} · ${(providerModels[provider] as Record<string, string>)[capability]}` : missing ? t.notAdded : t.needsAttention}</small></span>
          </button>
          {!ready && (provider === 'hosted' ? <SettingsButton type="button" onClick={() => goto('ai')}>{t.manage}</SettingsButton> : missing
            ? <SettingsButton type="button" onClick={() => goto('ai')}>{t.addKey}</SettingsButton>
            : <SettingsButton type="button" onClick={() => void ai.connect(provider, null)}>{t.retest}</SettingsButton>)}
        </div>
      })}
    </div>
    <p className="settings-card-foot m-0 px-4.5 py-2.5 flex items-center gap-2 text-[12px] text-muted-foreground"><span>{t.onlyCapable(feature)}</span></p>
  </SettingsGroup>
}
