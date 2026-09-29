/**
 * [INPUT]: useAi 状态与动作、固定服务、是否复用已存 Key、是否隐藏未签名提示（设置页已常驻显示）、提交按钮文案、成功回调、可选提交按钮渲染（onboarding 放进底栏）。
 * [OUTPUT]: 一个服务的连接表单：密码输入（提交即清空）、只读模型、官方控制台入口、接收方与费用说明、默认未勾选的发送同意、「测试」及逐能力结果。
 * [POS]: Onboarding 与「设置 › AI 服务」共用的唯一配置表单；任一能力测试通过才保存 Key，失败始终可跳过。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useId, useState, type ReactNode } from 'react'
import { providerCapabilities, providerModels } from '../../../shared/contracts/values'
import type { AiProvider, TestOutcome } from '../../../shared/contracts/smart-input'
import { smartMessages as t } from '../../i18n'
import type { Ai } from '../../state/ai'

export interface SubmitProps { type: 'submit'; form: string; disabled: boolean; children: string }
const inlineSubmit = (props: SubmitProps) => <div className="jev-actions"><button className="settings-button primary" {...props} /></div>
const consoleFailures = ['account_verification_required', 'quota_exhausted', 'payment_required', 'permission_denied']

export function ProviderConnect({ ai, provider, reuseSaved = false, hideUnsigned = false, submitLabel = t.testSave, done, actions = inlineSubmit }: {
  ai: Ai; provider: AiProvider; reuseSaved?: boolean; hideUnsigned?: boolean; submitLabel?: string; done?: (outcome: TestOutcome) => void
  // The submit button carries form={id}, so a host may render it outside the form (e.g. in a page footer).
  actions?: (submit: SubmitProps) => ReactNode
}) {
  const formId = useId()
  const [key, setKey] = useState(''), [consent, setConsent] = useState(false)
  const [working, setWorking] = useState(false), [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const saved = ai.status?.providers[provider].credential === 'saved'
  const useSaved = reuseSaved && saved && !key.trim()
  const models = providerCapabilities[provider].map(capability => `${t.capabilityNames[capability]} → ${(providerModels[provider] as Record<string, string>)[capability]}`).join(' · ')
  const test = async () => {
    setWorking(true); setOutcome(null)
    const typed = key.trim()
    setKey('')
    try {
      const result = await ai.connect(provider, useSaved ? null : typed)
      setOutcome(result)
      if (result?.ok) done?.(result)
    } catch { setOutcome({ ok: false, failure: { kind: 'unavailable', message: t.testFailed, status: null, retryAt: null }, sampleMatched: null, results: {}, enabled: [] }) }
    finally { setWorking(false) }
  }
  const results = outcome ? providerCapabilities[provider].filter(capability => outcome.results[capability]).map(capability => ({ capability, ...outcome.results[capability]! })) : []
  return <form id={formId} className="jev-connect" onSubmit={event => { event.preventDefault(); if (consent && (useSaved || key.trim().length >= 8) && !working) void test() }}>
    <label>{t.keyLabel(provider)}
      <input type="password" autoComplete="off" spellCheck={false} value={key} maxLength={512} placeholder={saved ? `${ai.status?.providers[provider].keyHint ?? ''}` : t.keyPlaceholder} disabled={working} onChange={event => setKey(event.target.value)} />
    </label>
    <p className="field-note">{t.modelNote(models)} · <button type="button" className="text-button small" onClick={() => ai.openConsole(provider)}>{t.getKey}</button></p>
    <p className="field-note">{t.recipient(provider)}</p>
    <p className="field-note">{t.cost}</p>
    {ai.status?.unsignedBuild && !hideUnsigned && <p className="field-note">{t.unsigned}</p>}
    <label className="check-label"><input type="checkbox" checked={consent} disabled={working} onChange={event => setConsent(event.target.checked)} />{t.consent}</label>
    {actions({ type: 'submit', form: formId, disabled: working || !consent || (!useSaved && key.trim().length < 8), children: working ? t.testing : submitLabel })}
    <div className="jev-result" role="status" data-ok={outcome?.ok ?? undefined}>
      {results.length > 0
        ? results.map(({ capability, ok, failure }) => <p key={capability} data-ok={ok}>{ok ? t.capabilityOk(t.capabilityNames[capability]) : t.capabilityFailed(t.capabilityNames[capability], failure?.message ?? t.testFailed)}</p>)
        : outcome?.failure && <p data-ok="false">{outcome.failure.message}</p>}
      {outcome?.ok && outcome.sampleMatched === false && <p data-ok="true">{t.sampleMismatch}</p>}
      {outcome?.failure && consoleFailures.includes(outcome.failure.kind) && <button type="button" className="text-button small" onClick={() => ai.openConsole(provider)}>{t.getKey}</button>}
    </div>
  </form>
}
