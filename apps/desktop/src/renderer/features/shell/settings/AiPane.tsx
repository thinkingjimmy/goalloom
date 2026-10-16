/**
 * [INPUT]: useAi 状态与动作。
 * [OUTPUT]: 「设置 › AI 服务」：已连接服务（能力标签、Key 遮罩与测试日期、正在使用它的功能、账户问题与控制台/重测入口、更换 Key、移除前说明会停用哪些功能）、可添加服务（连接表单在该行下展开）、隐私要点与可关闭的未签名私测提示。
 * [POS]: settings 的 AI 服务分类，唯一管理 Key 与服务的地方；智能输入与洞察只选用这里已连接的服务；设备配置不进入工作区数据。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SettingsButton, IconButton } from '../../../components/ui/button'
import { assistanceMessages } from '../../../i18n/assistance'
import { useState } from 'react'
import { aiCapabilities, aiProviders, providerCapabilities } from '../../../../shared/contracts/values'
import type { AiProvider } from '../../../../shared/contracts/smart-input'
import { insightMessages, messages, providerNames, settingsMessages, smartMessages as t } from '../../../i18n'
import { useDismissedNotice } from '../../../state/notices'
import { monthDay } from '../../../i18n/format'
import { connectedProviders, featureUsers, providerIssue, type Ai } from '../../../state/ai'
import { Icon } from '../../../components/icons'
import { ProviderConnect } from '../../smart/ProviderConnect'
import { SettingsGroup } from './parts'
import { issueText } from './FeatureControls'

const marks: Record<AiProvider, string> = { openrouter: 'OR', 'vercel-gateway': 'V' }

export function AiPane({ ai }: { ai: Ai }) {
  const [open, setOpen] = useState<AiProvider | null>(null), [removing, setRemoving] = useState<AiProvider | null>(null)
  const status = ai.status
  const unsigned = useDismissedNotice('unsigned', status?.unsignedBuild ? 'unsigned' : null)
  if (!status) return <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.testing}</p>
  const connected = connectedProviders(status), others = aiProviders.filter(provider => !connected.includes(provider))
  const featureName = { smart: t.sectionTitle, insight: insightMessages.settingsSection }
  const row = (provider: AiProvider) => {
    const value = status.providers[provider], isConnected = connected.includes(provider), issue = isConnected ? providerIssue(status, provider) : null
    const users = featureUsers(status, provider).map(feature => featureName[feature])
    const expanded = open === provider
    const detail = !isConnected ? t.notAdded : issue ? issueText(issue)
      : [value.keyHint && value.verifiedAt ? t.keyVerified(value.keyHint, monthDay(value.verifiedAt.slice(0, 10))) : value.keyHint, users.length ? t.usedBy(t.joinNames(users)) : null].filter(Boolean).join(' · ')
    const remove = () => { if (users.length && removing !== provider) { setRemoving(provider); return } setRemoving(null); setOpen(null); void ai.forget(provider) }
    return <div key={provider} className="smart-provider" data-open={expanded}>
      <div className="settings-row min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4">
        <span className="provider-mark w-7.5 h-7.5 shrink-0 grid place-items-center rounded-[8px] bg-hover text-[11px] font-bold tracking-[.02em] text-soft" aria-hidden="true">{marks[provider]}</span>
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">
          <span className="provider-name flex items-center flex-wrap gap-y-1.5 gap-x-2">{providerNames[provider]}
            {aiCapabilities.map(capability => {
              const name = t.capabilityNames[capability]
              if (!providerCapabilities[provider].includes(capability)) return <span key={capability} className="capability-chip h-5 px-[7px] py-0 inline-flex items-center rounded-[6px] text-[11.5px] font-medium bg-success-tint text-success" data-state="unsupported">{t.unsupported(name)}</span>
              const state = !isConnected ? 'pending' : issue || !value.capabilities[capability] ? 'issue' : 'ok'
              return <span key={capability} className="capability-chip h-5 px-[7px] py-0 inline-flex items-center rounded-[6px] text-[11.5px] font-medium bg-success-tint text-success" data-state={state}>{state === 'ok' ? '✓ ' : state === 'issue' ? '! ' : ''}{name}</span>
            })}
          </span>
          <small data-issue={!!issue}>{detail}</small>
        </div>
        {removing !== provider && <>
          {isConnected && !expanded && (issue
            ? <SettingsButton type="button" onClick={() => ai.openConsole(provider)}>{t.openConsole}</SettingsButton>
            : <SettingsButton variant="subtle-danger" type="button" onClick={remove}>{t.remove}</SettingsButton>)}
          {isConnected && issue && !expanded
            ? <SettingsButton variant="primary" type="button" onClick={() => void ai.connect(provider, null)}>{t.retest}</SettingsButton>
            : <SettingsButton type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : provider)}>{expanded ? t.collapse : isConnected ? t.replaceKey : t.addKey}</SettingsButton>}
        </>}
      </div>
      {removing === provider && <div className="settings-row provider-remove min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4" role="alert"><span>{t.removeWarning(t.joinNames(users))}</span>
        <SettingsButton type="button" onClick={() => setRemoving(null)}>{t.keepIt}</SettingsButton>
        <SettingsButton variant="danger" type="button" onClick={remove}>{t.confirmRemove}</SettingsButton></div>}
      {expanded && <div className="smart-provider-form pt-1 pr-4 pb-4 pl-15.5"><ProviderConnect key={provider} ai={ai} provider={provider} done={() => setOpen(null)} /></div>}
    </div>
  }
  return <>
    {connected.length > 0 && <SettingsGroup title={t.connectedGroup}>{connected.map(row)}</SettingsGroup>}
    {others.length > 0 && <SettingsGroup title={t.addGroup}>{others.map(row)}</SettingsGroup>}
    <section className="settings-group shrink-0 flex flex-col gap-2">
      <header className="settings-group-header flex items-baseline justify-between gap-3 px-0.5 py-0"><h3>{settingsMessages.privacy}</h3></header>
      <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{assistanceMessages().name} · {assistanceMessages().consentBody}</p>
      <ul className="settings-points m-0 px-0.5 py-0 list-none flex flex-col gap-1 text-[12.5px] leading-[1.6] text-soft">{settingsMessages.privacyPoints.map(point => <li key={point}>{point}</li>)}</ul>
      {unsigned.open && <div className="settings-footnote settings-warning m-0 text-[12px] leading-[1.7] flex items-start gap-2 text-warning" role="status"><Icon name="warning" size={14} /><span>{t.unsigned}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={unsigned.dismiss}><Icon name="close" size={16} /></IconButton></div>}
    </section>
  </>
}
