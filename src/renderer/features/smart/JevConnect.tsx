/**
 * [INPUT]: useSmart 状态与动作、可选预设服务、是否复用已存 Key、是否隐藏未签名提示（设置页已常驻显示）、成功回调、可选提交按钮渲染（onboarding 放进底栏）。
 * [OUTPUT]: 连接表单：TypeSafe 原生/AI Gateway/OpenRouter 单选、密码输入（提交即清空）、只读模型、官方控制台入口、接收方与费用说明、默认未勾选的发送同意、「测试并启用」及分类反馈。
 * [POS]: Onboarding 与「设置 → 智能输入」共用的唯一配置表单；测试通过前不标为已启用，失败始终可跳过。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId, useState, type ReactNode } from 'react'
import { jevProviders } from '../../../shared/contracts/values'
import type { JevProvider, TestOutcome } from '../../../shared/contracts/smart-input'
import { providerModels, providerNames, smartMessages as t } from '../../i18n'
import type { Smart } from '../../state/smart'

export interface SubmitProps { type: 'submit'; form: string; disabled: boolean; children: string }
const inlineSubmit = (props: SubmitProps) => <div className="jev-actions"><button className="settings-button primary" {...props} /></div>

export function JevConnect({ smart, preset, reuseSaved = false, hideUnsigned = false, done, actions = inlineSubmit }: {
  smart: Smart; preset?: JevProvider; reuseSaved?: boolean; hideUnsigned?: boolean; done?: (outcome: TestOutcome) => void
  // The submit button carries form={id}, so a host may render it outside the form (e.g. in a page footer).
  actions?: (submit: SubmitProps) => ReactNode
}) {
  const formId = useId()
  const [provider, setProvider] = useState<JevProvider>(preset ?? smart.status?.activeProvider ?? 'typesafe')
  const [key, setKey] = useState(''), [consent, setConsent] = useState(false)
  const [working, setWorking] = useState(false), [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const saved = smart.status?.providers[provider].credential === 'saved'
  const useSaved = reuseSaved && saved && !key.trim()
  const test = async () => {
    setWorking(true); setOutcome(null)
    const typed = key.trim()
    setKey('')
    try {
      const result = await smart.connect(provider, useSaved ? null : typed)
      setOutcome(result)
      if (result?.ok) done?.(result)
    } catch { setOutcome({ ok: false, failure: { kind: 'unavailable', message: t.testFailed, status: null, retryAt: null }, sampleMatched: null }) }
    finally { setWorking(false) }
  }
  return <form id={formId} className="jev-connect" onSubmit={event => { event.preventDefault(); if (consent && (useSaved || key.trim().length >= 8) && !working) void test() }}>
    {!preset && <div className="segmented" role="radiogroup" aria-label={t.providerLabel}>
      {jevProviders.map(value => <button key={value} type="button" role="radio" aria-checked={provider === value} disabled={working} onClick={() => { setProvider(value); setOutcome(null) }}>{providerNames[value]}</button>)}
    </div>}
    <label>{t.keyLabel(provider)}
      <input type="password" autoComplete="off" spellCheck={false} value={key} maxLength={512} placeholder={useSaved || saved ? t.savedKey(smart.status?.providers[provider].keyHint ?? null) : t.keyPlaceholder} disabled={working} onChange={event => setKey(event.target.value)} />
    </label>
    <p className="field-note">{t.modelNote(providerModels[provider])} · <button type="button" className="text-button small" onClick={() => smart.openConsole(provider)}>{t.getKey}</button></p>
    <p className="field-note">{t.recipient(provider)}</p>
    <p className="field-note">{t.cost}</p>
    {smart.status?.unsignedBuild && !hideUnsigned && <p className="field-note">{t.unsigned}</p>}
    <label className="check-label"><input type="checkbox" checked={consent} disabled={working} onChange={event => setConsent(event.target.checked)} />{t.consent}</label>
    {actions({ type: 'submit', form: formId, disabled: working || !consent || (!useSaved && key.trim().length < 8), children: working ? t.testing : t.testEnable })}
    <p className="jev-result" role="status" data-ok={outcome?.ok ?? undefined}>
      {outcome?.ok && (outcome.sampleMatched === false ? t.sampleMismatch : t.testOk)}
      {outcome && !outcome.ok && outcome.failure?.message}
      {outcome?.failure && ['account_verification_required', 'quota_exhausted', 'payment_required', 'permission_denied'].includes(outcome.failure.kind) && <button type="button" className="text-button small" onClick={() => smart.openConsole(provider)}>{t.getKey}</button>}
    </p>
  </form>
}
