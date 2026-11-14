/**
 * [INPUT]: Current account status, account-bound AI consent and existing finite account actions.
 * [OUTPUT]: Responsive account card with sign-in availability, browser authorization, sign-out and explicit scope-v3 consent.
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
  const signingIn = account?.phase === 'signing-in'
  const configured = !!account && account.phase !== 'unconfigured'
  const note = signedIn ? account.email
    : signingIn ? t.signInWaiting
    : configured ? t.signIn
    : account ? t.signInUnavailable : t.accountLoading
  return <>
    <SettingsGroup>
      <SettingsRow className="hosted-ai-account flex-wrap gap-y-2.5" title={signedIn ? t.account : t.name} note={note && <span role="status">{note}</span>}>
        {configured && <div className="hosted-ai-account-actions flex max-w-full flex-wrap items-center gap-2">
          {signedIn ? <SettingsButton type="button" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{s.sync.signOut}</SettingsButton>
            : (['apple', 'google'] as const).map(provider => <SettingsButton key={provider} type="button" disabled={working || signingIn} onClick={() => void run({ type: 'sign-in', provider, purpose: 'ai' })}>
              <AuthMark provider={provider} size={16} /><span>{provider === 'apple' ? s.sync.signInApple : s.sync.signIn}</span>
            </SettingsButton>)}
          {signingIn && <SettingsButton type="button" onClick={() => void desktopApi().sync({ type: 'cancel' }).catch(() => setFailed(true))}>{s.sync.cancel}</SettingsButton>}
        </div>}
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
