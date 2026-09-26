/**
 * [INPUT]: useSmart 状态与动作。
 * [OUTPUT]: 「设置 → 智能输入」：状态卡（启用/暂停/未启用、失败与限流说明、启用或关闭）、服务单选样式列表（Key 遮罩与更换/删除/切换，连接表单在该服务行下展开，均先测试）、纯文字隐私要点与未签名私测提示。
 * [POS]: settings 的智能输入分类；已有用户在此启用，不重复向导；设备配置不进入工作区数据。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { jevProviders } from '../../../../shared/contracts/values'
import type { JevProvider } from '../../../../shared/contracts/smart-input'
import { providerNames, smartMessages as t, settingsMessages } from '../../../i18n'
import type { Smart } from '../../../state/smart'
import { Icon } from '../../../components/icons'
import { JevConnect } from '../../smart/JevConnect'
import { SettingsGroup } from './parts'

export function SmartPane({ smart }: { smart: Smart }) {
  const status = smart.status
  const [editing, setEditing] = useState<JevProvider | null>(null)
  if (!status) return <p className="settings-footnote">{t.testing}</p>
  const active = status.activeProvider
  const state = status.enabled && active ? 'enabled' : status.paused ? 'paused' : 'disabled'
  const summary = state === 'enabled' ? t.enabled(active!) : state === 'paused' ? t.paused : t.disabled
  const note = status.lastFailure?.message ?? (status.cooldownUntil ? t.cooldown(new Date(status.cooldownUntil).toLocaleTimeString()) : state === 'enabled' ? settingsMessages.smartEnabledNote : null)
  const credential = (provider: JevProvider) => ({ saved: t.savedKey(status.providers[provider].keyHint), missing: t.noKey, unreadable: t.unreadableKey, unavailable: t.unavailableKey })[status.providers[provider].credential]
  const canEnable = !status.enabled && active && status.providers[active].credential === 'saved'
  return <>
    <div className="settings-hero" data-state={state}>
      <span className="settings-hero-icon" aria-hidden="true"><Icon name={state === 'paused' ? 'warning' : 'smart'} size={20} /></span>
      <div className="settings-row-text"><span>{summary}</span>{note && <small>{note}</small>}</div>
      {status.enabled
        ? <button type="button" className="settings-button" onClick={() => void smart.disable()}>{t.disable}</button>
        : canEnable && <button type="button" className="settings-button primary" onClick={() => setEditing(active)}>{status.paused ? t.reenable : t.enable}</button>}
    </div>
    <SettingsGroup title={t.providerLabel}>
      {jevProviders.map(provider => {
        const open = editing === provider, saved = status.providers[provider].credential !== 'missing', current = active === provider
        const label = !saved ? t.addKey : current ? t.replaceKey : t.switchTo
        return <div key={provider} className="smart-provider" data-open={open}>
          <div className="settings-row">
            <span className="settings-radio" data-checked={current} aria-hidden="true" />
            <div className="settings-row-text">
              <span>{providerNames[provider]}{current && <span className="settings-tag">{t.current}</span>}</span>
              <small>{credential(provider)}</small>
            </div>
            {saved && !open && <button type="button" className="settings-button subtle-danger" onClick={() => void smart.forget(provider)}>{t.forgetKey}</button>}
            <button type="button" className="settings-button" aria-expanded={open} onClick={() => setEditing(open ? null : provider)}>{open ? t.collapse : label}</button>
          </div>
          {open && <div className="smart-provider-form"><JevConnect key={provider} smart={smart} preset={provider} reuseSaved hideUnsigned done={() => setEditing(null)} /></div>}
        </div>
      })}
    </SettingsGroup>
    <section className="settings-group">
      <header className="settings-group-header"><h3>{settingsMessages.privacy}</h3></header>
      <ul className="settings-points">{settingsMessages.privacyPoints.map(point => <li key={point}>{point}</li>)}</ul>
      {status.unsignedBuild && <p className="settings-footnote settings-warning"><Icon name="warning" size={14} /><span>{t.unsigned}</span></p>}
    </section>
  </>
}
