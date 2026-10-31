/**
 * [INPUT]: Current account status, account-bound AI consent and existing finite account actions.
 * [OUTPUT]: Account-only login, cancellation, sign-out and explicit scope-v3 operator consent without model tests.
 * [POS]: AI settings account boundary; feature selection and enabling remain in their existing panes.
 */
import { useState } from 'react'
import type { Ai } from '../../../state/ai'
import { useSync } from '../../../state/sync'
import { desktopApi } from '../../../state/use-workspace'
import { currentLocale, settingsMessages as s } from '../../../i18n'
import { hostedCatalog } from '../../../../shared/i18n/hosted'
import type { SyncAction } from '../../../../shared/contracts/sync'
import { SettingsButton } from '../../../components/ui/button'
import { AuthMark } from '../../../components/AuthMark'
import { SettingsGroup, SettingsRow } from './parts'
import { useBilling } from '../../../state/billing'
import { BillingCard } from './BillingCard'

export function HostedAiSettings({ ai }: { ai: Ai }) {
  const account = useSync(), [working, setWorking] = useState(false), [failed, setFailed] = useState(false)
  const billing = useBilling()
  const t = hostedCatalog[currentLocale()]
  const run = async (action: SyncAction) => {
    setWorking(true); setFailed(false)
    try { const reply = await desktopApi().sync(action); setFailed(!!reply.status.error); await ai.refresh() }
    catch { setFailed(true) } finally { setWorking(false) }
  }
  const signedIn = !!account?.accountId && account.accountId === ai.status?.hostedAccountId
  return <>
    <SettingsGroup>
      <SettingsRow title={t.account} note={signedIn ? account.email : t.signIn}>
        {signedIn ? <SettingsButton type="button" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{s.sync.signOut}</SettingsButton>
          : <>{(['apple', 'google'] as const).map(provider => <SettingsButton key={provider} type="button" disabled={working || !account || account.phase === 'unconfigured' || account.phase === 'signing-in'} onClick={() => void run({ type: 'sign-in', provider, purpose: 'ai' })}><AuthMark provider={provider} size={14} />{provider === 'apple' ? s.sync.signInApple : s.sync.signIn}</SettingsButton>)}</>}
        {account?.phase === 'signing-in' && <SettingsButton type="button" onClick={() => void run({ type: 'cancel' })}>{s.sync.cancel}</SettingsButton>}
      </SettingsRow>
    </SettingsGroup>
    {signedIn && <BillingCard state={billing.state} run={billing.run} />}
    {signedIn && <SettingsGroup title={t.name}>
      <SettingsRow title={t.title} note={t.body}>
        {!ai.status?.providers.hosted.consentedAt && <SettingsButton type="button" variant="primary" disabled={working} onClick={() => {
          setWorking(true); setFailed(false)
          void ai.consentHosted().catch(() => setFailed(true)).finally(() => setWorking(false))
        }}>{t.consent}</SettingsButton>}
      </SettingsRow>
      {ai.status?.providers.hosted.consentedAt && <p className="settings-card-foot m-0 px-4.5 py-2.5 text-[12px] text-muted-foreground" role="status">{ai.status?.hostedEligible === true ? t.ready : t.unavailable}</p>}
    </SettingsGroup>}
    {failed && <p role="alert" className="settings-footnote text-destructive">{t.unavailable}</p>}
  </>
}
