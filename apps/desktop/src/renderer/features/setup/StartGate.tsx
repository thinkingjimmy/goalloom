/**
 * [INPUT]: An unconfirmed workspace, sync status, existing setup confirmation, shared icon controls and the native recovery dialog.
 * [OUTPUT]: Choice, provider wait, join or new-password and safe recovery after explicit setup confirmation. A normal join installs the cloud calendar and skips setup.
 * [POS]: First-run entry in front of Setup. Direct use adds one back step; the first device uploads only after confirmation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { IconButton } from '../../components/ui/button'
import { useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { SyncAction, SyncReply, SyncStatus } from '../../../shared/contracts/sync'
import { messages, settingsMessages as settings } from '../../i18n'
import { Icon } from '../../components/icons'
import { desktopApi } from '../../state/use-workspace'
import { useSync } from '../../state/sync'
import { Setup, type CalendarChoice } from './Setup'
import { startScreen } from './entry'
import { ChoiceScreen, JoinPasswordScreen, NewPasswordScreen, SyncingScreen } from './StartScreens'
import { SyncRecovery } from '../shell/settings/SyncRecovery'

export function StartGate({ confirm, busy, errorCode, status: override, sync = action => desktopApi().sync(action) }: {
  confirm: (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => Promise<boolean>
  busy: boolean
  errorCode: string | null
  status?: SyncStatus | null
  sync?: (action: SyncAction) => Promise<SyncReply>
}) {
  const live = useSync()
  const status = override === undefined ? live : override
  const [direct, setDirect] = useState(false)
  const [held, setHeld] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [working, setWorking] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [recoveryAction, setRecoveryAction] = useState<Extract<SyncAction, { type: 'create-new-workspace' | 'reset-sync' }> | null>(null)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const screen = startScreen({
    direct, passwordReady: !!held, joining, phase: status?.phase ?? null, error: status?.error ?? null,
  })
  const run = async (action: SyncAction) => {
    setHiddenError(null)
    setWorking(true)
    try { return await sync(action) }
    finally { setWorking(false) }
  }
  const leave = () => {
    setDirect(false); setHeld(null); setJoining(false); setResetOpen(false); setRecoveryAction(null)
    void run({ type: 'sign-out' })
  }
  const confirmSetup = async (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => {
    const ok = await confirm(calendar, direction, period)
    if (ok && recoveryAction) { await run(recoveryAction); return }
    if (!ok || !held) return
    await run({ type: 'create', password: held })
  }
  const bannerError = status?.phase !== 'signing-in' && status?.error && status.error !== 'password' && hiddenError !== status.error ? settings.sync.errors[status.error] : ''
  const banner = bannerError ? <div className="start-alert fixed top-4 left-[50%] flex items-start gap-2.5 pt-3 pr-3 pb-3 pl-3.5 rounded-[10px] bg-raised text-[13px] leading-[1.6] text-soft" role="alert"><span>{bannerError}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status?.error ?? null)}><Icon name="close" size={16} /></IconButton></div> : null
  if (recoveryAction) return <Setup confirm={(calendar, direction, period) => void confirmSetup(calendar, direction, period)} busy={busy || working} errorCode={errorCode} back={() => setRecoveryAction(null)} />
  if (screen === 'setup') return <Setup confirm={(calendar, direction, period) => void confirmSetup(calendar, direction, period)} busy={busy || working} errorCode={errorCode} {...(direct ? { back: () => setDirect(false) } : {})} />
  if (screen === 'syncing') return <SyncingScreen />
  if (screen === 'password') return <>
    {banner}
    <NewPasswordScreen email={status?.email ?? null} busy={working} onBack={leave} onContinue={password => setHeld(password)} />
  </>
  if (screen === 'join') return <>
    {banner}
    <JoinPasswordScreen email={status?.email ?? null} wrong={status?.error === 'password'} busy={working} onBack={leave} onReset={() => setResetOpen(true)} onSubmit={password => {
      setJoining(true)
      void run({ type: 'submit-password', password }).then(reply => {
        if (!reply || reply.status.error || reply.status.phase === 'enter-key' || reply.status.phase === 'choose') setJoining(false)
      }, () => setJoining(false))
    }} />
    {resetOpen && <SyncRecovery working={working} close={() => setResetOpen(false)} run={async action => {
      if (action.type !== 'create-new-workspace' && action.type !== 'reset-sync') return false
      setRecoveryAction(action); setJoining(false); setResetOpen(false)
      return true
    }} />}
  </>
  return <>
    {banner}
    <ChoiceScreen waiting={screen === 'waiting'} provider={status?.signingInProvider ?? 'google'} busy={working} onLocal={() => setDirect(true)} onSignIn={provider => void run({ type: 'sign-in', provider })} onCancel={() => void run({ type: 'cancel' })} />
  </>
}
