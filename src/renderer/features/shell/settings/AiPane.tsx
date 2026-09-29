/**
 * [INPUT]: useAi 状态与动作。
 * [OUTPUT]: 「设置 › AI 服务」：已连接服务（能力标签、Key 遮罩与测试日期、正在使用它的功能、账户问题与控制台/重测入口、更换 Key、移除前说明会停用哪些功能）、可添加服务（连接表单在该行下展开）、隐私要点与未签名私测提示。
 * [POS]: settings 的 AI 服务分类，唯一管理 Key 与服务的地方；智能输入与洞察只选用这里已连接的服务；设备配置不进入工作区数据。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { aiCapabilities, aiProviders, providerCapabilities } from '../../../../shared/contracts/values'
import type { AiProvider } from '../../../../shared/contracts/smart-input'
import { insightMessages, providerNames, settingsMessages, smartMessages as t } from '../../../i18n'
import { monthDay } from '../../../i18n/format'
import { connectedProviders, featureUsers, providerIssue, type Ai } from '../../../state/ai'
import { Icon } from '../../../components/icons'
import { ProviderConnect } from '../../smart/ProviderConnect'
import { SettingsGroup } from './parts'
import { issueText } from './FeatureControls'

const marks: Record<AiProvider, string> = { openrouter: 'OR', 'vercel-gateway': 'V', typesafe: 'TS' }

export function AiPane({ ai }: { ai: Ai }) {
  const [open, setOpen] = useState<AiProvider | null>(null), [removing, setRemoving] = useState<AiProvider | null>(null)
  const status = ai.status
  if (!status) return <p className="settings-footnote">{t.testing}</p>
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
      <div className="settings-row">
        <span className="provider-mark" aria-hidden="true">{marks[provider]}</span>
        <div className="settings-row-text">
          <span className="provider-name">{providerNames[provider]}
            {aiCapabilities.map(capability => {
              const name = t.capabilityNames[capability]
              if (!providerCapabilities[provider].includes(capability)) return <span key={capability} className="capability-chip" data-state="unsupported">{t.unsupported(name)}</span>
              const state = !isConnected ? 'pending' : issue || !value.capabilities[capability] ? 'issue' : 'ok'
              return <span key={capability} className="capability-chip" data-state={state}>{state === 'ok' ? '✓ ' : state === 'issue' ? '! ' : ''}{name}</span>
            })}
          </span>
          <small data-issue={!!issue}>{detail}</small>
        </div>
        {removing !== provider && <>
          {isConnected && !expanded && (issue
            ? <button type="button" className="settings-button" onClick={() => ai.openConsole(provider)}>{t.openConsole}</button>
            : <button type="button" className="settings-button subtle-danger" onClick={remove}>{t.remove}</button>)}
          {isConnected && issue && !expanded
            ? <button type="button" className="settings-button primary" onClick={() => void ai.connect(provider, null)}>{t.retest}</button>
            : <button type="button" className="settings-button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : provider)}>{expanded ? t.collapse : isConnected ? t.replaceKey : t.addKey}</button>}
        </>}
      </div>
      {removing === provider && <div className="settings-row provider-remove" role="alert"><span>{t.removeWarning(t.joinNames(users))}</span>
        <button type="button" className="settings-button" onClick={() => setRemoving(null)}>{t.keepIt}</button>
        <button type="button" className="settings-button danger" onClick={remove}>{t.confirmRemove}</button></div>}
      {expanded && <div className="smart-provider-form"><ProviderConnect key={provider} ai={ai} provider={provider} hideUnsigned done={() => setOpen(null)} /></div>}
    </div>
  }
  return <>
    {connected.length > 0 && <SettingsGroup title={t.connectedGroup}>{connected.map(row)}</SettingsGroup>}
    {others.length > 0 && <SettingsGroup title={t.addGroup} aside={<small className="settings-group-note">{t.addGroupNote}</small>}>{others.map(row)}</SettingsGroup>}
    <section className="settings-group">
      <header className="settings-group-header"><h3>{settingsMessages.privacy}</h3></header>
      <ul className="settings-points">{settingsMessages.privacyPoints.map(point => <li key={point}>{point}</li>)}</ul>
      {status.unsignedBuild && <p className="settings-footnote settings-warning"><Icon name="warning" size={14} /><span>{t.unsigned}</span></p>}
    </section>
  </>
}
