/**
 * [INPUT]: An unconfirmed workspace, account/sync status, trusted Plus qualification, setup confirmation and the native recovery dialog.
 * [OUTPUT]: Qualified sync-or-local choice, explicit setup and account/generation-bound recovery intent without passwords or approval tokens; retains local setup drafts across welcome.
 * [POS]: First-run entry in front of Setup. Direct use adds one back step; the first device uploads only after confirmation.
 */
import { IconButton } from '../../components/ui/button'
import { useEffect, useLayoutEffect, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { SyncAction, SyncReply, SyncStatus } from '../../../shared/contracts/sync'
import { messages, settingsMessages as settings } from '../../i18n'
import { Icon } from '../../components/icons'
import { desktopApi } from '../../state/use-workspace'
import { useSync } from '../../state/sync'
import { Setup, type CalendarChoice } from './Setup'
import { startScreen } from './entry'
import { useSetupSession } from './use-setup-session'
import { ChoiceScreen, JoinPasswordScreen, NewPasswordScreen, SyncingScreen } from './StartScreens'
import { useBilling } from '../../state/billing'
import { BillingCard } from '../shell/settings/BillingCard'
import { billingCatalog } from '../../../shared/i18n/billing'
import { currentLocale } from '../../i18n'
import { SettingsButton } from '../../components/ui/button'
import { useOnboardingStage } from './OnboardingStage'

export interface SetupRecoveryIntent { accountId: string; localGeneration: string }

export function StartGate({ confirm, generation, onRecoveryReady, busy, errorCode, skipAi = false, status: override, sync = action => desktopApi().sync(action) }: {
  confirm: (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => Promise<boolean>
  generation: string
  onRecoveryReady: (intent: SetupRecoveryIntent) => Promise<void>
  skipAi?: boolean
  busy: boolean
  errorCode: string | null
  status?: SyncStatus | null
  sync?: (action: SyncAction) => Promise<SyncReply>
}) {
  const session = useSetupSession()
  const live = useSync()
  const billing = useBilling()
  const status = override === undefined ? live : override
  const [direct, setDirect] = useState(false)
  const [setupStarted, setSetupStarted] = useState(false)
  const [held, setHeld] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [working, setWorking] = useState(false)
  const [recoveryIntent, setRecoveryIntent] = useState<SetupRecoveryIntent | null>(null)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const screen = startScreen({
    direct, passwordReady: !!held, joining, phase: status?.phase ?? null, error: status?.error ?? null,
  })
  const stage = useOnboardingStage()
  useLayoutEffect(() => { if (screen !== 'setup' && !recoveryIntent) stage?.publish(null) }, [stage, screen, recoveryIntent])
  useEffect(() => { if (screen === 'setup' && (direct || status?.phase !== 'account')) setSetupStarted(true) }, [screen, direct, status?.phase])
  useEffect(() => { setRecoveryIntent(current => current && current.accountId === status?.accountId && current.localGeneration === generation ? current : null) }, [status?.accountId, generation])
  const run = async (action: SyncAction) => {
    setHiddenError(null)
    setWorking(true)
    try { return await sync(action) }
    finally { setWorking(false) }
  }
  const leave = () => {
    setDirect(false); setHeld(null); setJoining(false); setRecoveryIntent(null)
    void run({ type: 'sign-out' })
  }
  const confirmSetup = async (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => {
    const intent = recoveryIntent
    const ok = await confirm(calendar, direction, period)
    if (ok && intent) { await onRecoveryReady(intent); return }
    if (!ok || !held) return
    await run({ type: 'create', password: held })
  }
  const bannerError = status?.phase !== 'signing-in' && status?.error && status.error !== 'password' && hiddenError !== status.error ? settings.sync.errors[status.error] : ''
  const banner = bannerError ? <div className="start-alert fixed top-4 left-[50%] flex items-start gap-2.5 pt-3 pr-3 pb-3 pl-3.5 rounded-[10px] bg-raised text-[13px] leading-[1.6] text-soft" role="alert"><span>{bannerError}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status?.error ?? null)}><Icon name="close" size={16} /></IconButton></div> : null
  if (status?.phase === 'account' && !direct && !setupStarted) return <main className="onboarding onboarding-main onboarding-flow flex-1 min-h-0 overflow-y-auto"><div className="onboarding-content onboarding-stack start-billing flex flex-col gap-5">
    {banner}
    <p className="m-0 text-[13px] text-muted-foreground">{status.email}</p>
    <BillingCard state={billing.state} run={billing.run} />
    <div className="flex flex-wrap justify-end gap-2">
      <SettingsButton type="button" onClick={() => setDirect(true)}>{billingCatalog[currentLocale()].local}</SettingsButton>
      {skipAi && <SettingsButton type="button" variant="primary" disabled={working} onClick={() => void run({ type: 'prepare-sync' })}>{billingCatalog[currentLocale()].configureSync}</SettingsButton>}
    </div>
  </div></main>
  if (recoveryIntent) return <Setup session={session} skipAi={skipAi} confirm={(calendar, direction, period) => void confirmSetup(calendar, direction, period)} busy={busy || working} errorCode={errorCode} back={() => setRecoveryIntent(null)} />
  if (screen === 'setup') return <Setup session={session} skipAi={skipAi} confirm={(calendar, direction, period) => void confirmSetup(calendar, direction, period)} busy={busy || working} errorCode={errorCode} {...(direct ? { back: event => { session.setEntryMotion(event.detail === 0 ? null : 'backward'); setDirect(false); setSetupStarted(false) } } : {})} />
  if (screen === 'syncing') return <SyncingScreen />
  if (screen === 'password') return <>
    {banner}
    <NewPasswordScreen email={status?.email ?? null} busy={working} onBack={leave} onContinue={password => setHeld(password)} />
  </>
  if (screen === 'join') return <>
    {banner}
    <JoinPasswordScreen email={status?.email ?? null} wrong={status?.error === 'password'} busy={working} onBack={leave} onReset={() => { if (status?.accountId) { setJoining(false); setRecoveryIntent({ accountId: status.accountId, localGeneration: generation }) } }} onSubmit={password => {
      setJoining(true)
      void run({ type: 'submit-password', password }).then(reply => {
        if (!reply || reply.status.error || reply.status.phase === 'enter-key' || reply.status.phase === 'choose') setJoining(false)
      }, () => setJoining(false))
    }} />
  </>
  return <>
    {banner}
    <ChoiceScreen entryMotion={session.entryMotion} waiting={screen === 'waiting'} provider={status?.signingInProvider ?? 'google'} busy={working} onLocal={event => { session.setEntryMotion(event.detail === 0 ? null : 'forward'); setDirect(true) }} onSignIn={provider => void run({ type: 'sign-in', provider, purpose: 'ai' })} onCancel={() => void run({ type: 'cancel' })} />
  </>
}
