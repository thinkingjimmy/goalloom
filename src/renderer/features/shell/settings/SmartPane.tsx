/**
 * [INPUT]: useSmart 状态与动作。
 * [OUTPUT]: 「设置 → 智能输入」：连接状态/暂停原因、启用与关闭、按服务的 Key 遮罩/更换/删除/切换（均先测试）、隐私与未签名私测提示。
 * [POS]: settings 的智能输入分类；已有用户在此启用，不重复向导；设备配置不进入工作区数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import { jevProviders, type JevProvider } from '../../../../shared/contracts/smart-input'
import { providerNames, smartMessages as t } from '../../../i18n/smart'
import type { Smart } from '../../../state/smart'
import { JevConnect } from '../../smart/JevConnect'
import { SettingsGroup, SettingsRow } from './parts'

export function SmartPane({ smart }: { smart: Smart }) {
  const status = smart.status
  const [editing, setEditing] = useState<JevProvider | null>(null)
  if (!status) return <p className="settings-footnote">{t.testing}</p>
  const active = status.activeProvider
  const summary = status.enabled && active ? t.enabled(active) : status.paused ? t.paused : t.disabled
  const credential = (provider: JevProvider) => ({ saved: t.savedKey(status.providers[provider].keyHint), missing: t.noKey, unreadable: t.unreadableKey, unavailable: t.unavailableKey })[status.providers[provider].credential]
  return <>
    <SettingsGroup title={t.status} footnote={status.cooldownUntil ? t.cooldown(new Date(status.cooldownUntil).toLocaleTimeString()) : undefined}>
      <SettingsRow title={summary} note={status.lastFailure?.message}>
        {status.enabled
          ? <button type="button" className="settings-button" onClick={() => void smart.disable()}>{t.disable}</button>
          : active && status.providers[active].credential === 'saved' && <button type="button" className="settings-button primary" onClick={() => setEditing(active)}>{status.paused ? t.reenable : t.enable}</button>}
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={t.providerLabel}>
      {jevProviders.map(provider => <SettingsRow key={provider} title={<>{providerNames[provider]}{active === provider ? ' ·当前' : ''}</>} note={credential(provider)}>
        <button type="button" className="settings-button" onClick={() => setEditing(editing === provider ? null : provider)}>{status.providers[provider].credential === 'missing' ? t.addKey : active === provider ? t.replaceKey : t.switchTo}</button>
        {status.providers[provider].credential !== 'missing' && <button type="button" className="settings-button danger" onClick={() => void smart.forget(provider)}>{t.forgetKey}</button>}
      </SettingsRow>)}
    </SettingsGroup>
    {editing && <SettingsGroup title={providerNames[editing]}><div className="settings-form"><JevConnect key={editing} smart={smart} preset={editing} reuseSaved done={() => setEditing(null)} /></div></SettingsGroup>}
    <SettingsGroup title={t.privacyTitle} footnote={status.unsignedBuild ? t.unsigned : undefined}><SettingsRow title={t.privacy} /></SettingsGroup>
  </>
}
