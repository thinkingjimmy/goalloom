/**
 * [INPUT]: Real AI actions, provider, saved-key policy, submit slot, feedback placement and working-state callback.
 * [OUTPUT]: Password input cleared on submit, explicit provider-named consent and actual per-capability feedback.
 * [POS]: Shared Onboarding/Settings connection form. Only a passing capability saves credentials; hosts own navigation.
 */
import { Input } from '../../components/ui/fields'
import { SettingsButton, TextButton } from '../../components/ui/button'
import { useId, useState, type ReactNode } from 'react'
import { providerCapabilities } from '../../../shared/contracts/values'
import type { AiProvider, TestOutcome } from '../../../shared/contracts/smart-input'
import { providerNames, smartMessages as t } from '../../i18n'
import type { Ai } from '../../state/ai'

export interface SubmitProps { type: 'submit'; form: string; disabled: boolean; children: string }
const inlineSubmit = (props: SubmitProps) => <div className="jev-actions flex gap-2 mt-2"><SettingsButton variant="primary" {...props} /></div>
const consoleFailures = ['account_verification_required', 'quota_exhausted', 'payment_required', 'permission_denied']

export function ProviderConnect({ ai, provider, reuseSaved = false, submitLabel = t.testSave, done, actions = inlineSubmit, feedbackFirst = false, onWorkingChange }: {
  ai: Ai; provider: AiProvider; reuseSaved?: boolean; submitLabel?: string; done?: (outcome: TestOutcome) => void
  // The submit button carries form={id}, so a host may render it outside the form (e.g. in a page footer).
  actions?: (submit: SubmitProps) => ReactNode
  feedbackFirst?: boolean; onWorkingChange?: (working: boolean) => void
}) {
  const formId = useId(), keyId = useId()
  const [key, setKey] = useState(''), [consent, setConsent] = useState(false)
  const [working, setWorking] = useState(false), [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const saved = ai.status?.providers[provider].credential === 'saved'
  const useSaved = reuseSaved && saved && !key.trim()
  const test = async () => {
    setWorking(true); onWorkingChange?.(true); setOutcome(null)
    const typed = key.trim()
    setKey('')
    try {
      const result = await ai.connect(provider, useSaved ? null : typed)
      setOutcome(result)
      if (result?.ok) done?.(result)
    } catch { setOutcome({ ok: false, failure: { kind: 'unavailable', message: t.testFailed, status: null, retryAt: null }, sampleMatched: null, results: {}, enabled: [] }) }
    finally { setWorking(false); onWorkingChange?.(false) }
  }
  const results = outcome ? providerCapabilities[provider].filter(capability => outcome.results[capability]).map(capability => ({ capability, ...outcome.results[capability]! })) : []
  const feedback = <div className="jev-result min-h-5 mt-1.5 mr-0 mb-0 ml-0 text-[12.5px] leading-[1.6] text-destructive flex flex-col flex-wrap items-center gap-2" role="status" data-ok={outcome?.ok ?? undefined}>
      {results.length > 0
        ? results.map(({ capability, ok, failure }) => <p key={capability} data-ok={ok}>{ok ? t.capabilityOk(t.capabilityNames[capability]) : t.capabilityFailed(t.capabilityNames[capability], failure?.message ?? t.testFailed)}</p>)
        : outcome?.failure && <p data-ok="false">{outcome.failure.message}</p>}
      {outcome?.ok && outcome.sampleMatched === false && <p data-ok="true">{t.sampleMismatch}</p>}
      {outcome?.failure && consoleFailures.includes(outcome.failure.kind) && <TextButton type="button" className="small" onClick={() => ai.openConsole(provider)}>{t.getKey}</TextButton>}
    </div>
  return <form id={formId} className="jev-connect flex flex-col gap-1" onSubmit={event => { event.preventDefault(); if (consent && (useSaved || key.trim().length >= 8) && !working) void test() }}>
    <div className="jev-key-head flex items-baseline justify-between gap-3 text-[12px] text-muted-foreground"><label htmlFor={keyId}>{t.keyLabel(provider)}</label><TextButton type="button" className="small" onClick={() => ai.openConsole(provider)}>{t.getKey}</TextButton></div>
    <Input id={keyId} type="password" autoComplete="off" spellCheck={false} value={key} maxLength={512} placeholder={saved ? `${ai.status?.providers[provider].keyHint ?? ''}` : t.keyPlaceholder} disabled={working} onChange={event => setKey(event.target.value)} />
    <label className="check-label"><input type="checkbox" checked={consent} disabled={working} onChange={event => setConsent(event.target.checked)} />{t.consent(providerNames[provider])}</label>
    {feedbackFirst && feedback}
    {actions({ type: 'submit', form: formId, disabled: working || !consent || (!useSaved && key.trim().length < 8), children: working ? t.testing : submitLabel })}
    {!feedbackFirst && feedback}

  </form>
}
