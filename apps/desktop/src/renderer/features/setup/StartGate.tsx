/**
 * [INPUT]: An unconfirmed workspace, sync status, existing setup confirmation and shared icon controls.
 * [OUTPUT]: Choice, inline Google wait, join or new-password, then the original setup. A join installs the cloud calendar and skips setup.
 * [POS]: First-run entry in front of Setup. Direct use adds one back step; the first device uploads only after confirmation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { IconButton } from '../../components/ui/button'
import { useEffect, useRef, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { SyncAction, SyncReply, SyncStatus } from '../../../shared/contracts/sync'
import { messages, settingsMessages as settings } from '../../i18n'
import { Icon } from '../../components/icons'
import { desktopApi } from '../../state/use-workspace'
import { useSync } from '../../state/sync'
import { Setup, type CalendarChoice } from './Setup'
import { startScreen } from './entry'
import { ChoiceScreen, JoinPasswordScreen, NewPasswordScreen, ResetSyncDialog, SyncingScreen } from './StartScreens'

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
  const [acknowledged, setAcknowledged] = useState(false)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const syncRef = useRef(sync)
  syncRef.current = sync
  useEffect(() => {
    if (override !== undefined) return
    if (status?.phase === 'signed-out' && status.error === 'auth') void syncRef.current({ type: 'cancel' })
  }, [override, status?.phase, status?.error])
  const screen = startScreen({
    direct, passwordReady: !!held, joining, phase: status?.phase ?? null, error: status?.error ?? null,
  })
  const run = async (action: SyncAction) => {
    setWorking(true)
    try { return await sync(action) }
    finally { setWorking(false) }
  }
  const leave = () => {
    setDirect(false); setHeld(null); setJoining(false); setResetOpen(false); setAcknowledged(false)
    void run({ type: 'sign-out' })
  }
  const confirmSetup = async (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => {
    const ok = await confirm(calendar, direction, period)
    if (!ok || !held) return
    await run({ type: 'create', password: held })
  }
  const bannerError = status?.error && status.error !== 'auth' && status.error !== 'password' && hiddenError !== status.error ? settings.sync.errors[status.error] : ''
  const banner = bannerError ? <div className="start-alert fixed top-4 left-[50%] flex items-start gap-2.5 pt-3 pr-3 pb-3 pl-3.5 rounded-[10px] bg-raised text-[13px] leading-[1.6] text-soft" role="alert"><span>{bannerError}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status?.error ?? null)}><Icon name="close" size={16} /></IconButton></div> : null
  if (screen === 'setup') return <Setup confirm={(calendar, direction, period) => void confirmSetup(calendar, direction, period)} busy={busy || working} errorCode={errorCode} {...(direct ? { back: () => setDirect(false) } : {})} />
  if (screen === 'syncing') return <SyncingScreen />
  if (screen === 'password') return <>
    {banner}
    <NewPasswordScreen email={status?.email ?? null} busy={working} onBack={leave} onContinue={password => setHeld(password)} />
  </>
  if (screen === 'join') return <>
    {banner}
    <JoinPasswordScreen email={status?.email ?? null} wrong={status?.error === 'password'} busy={working} onBack={leave} onReset={() => { setAcknowledged(false); setResetOpen(true) }} onSubmit={password => {
      setJoining(true)
      void run({ type: 'submit-password', password }).then(reply => {
        if (!reply || reply.status.error || reply.status.phase === 'enter-key' || reply.status.phase === 'choose') setJoining(false)
      }, () => setJoining(false))
    }} />
    {resetOpen && <ResetSyncDialog acknowledged={acknowledged} busy={working} onAcknowledge={setAcknowledged} onCancel={() => setResetOpen(false)} onConfirm={() => {
      void run({ type: 'reset-cloud' }).then(reply => {
        if (reply?.status.phase === 'setup') { setResetOpen(false); setJoining(false); setAcknowledged(false) }
      })
    }} />}
  </>
  return <>
    {banner}
    <ChoiceScreen waiting={screen === 'waiting'} onLocal={() => setDirect(true)} onGoogle={() => void run({ type: 'sign-in' })} onCancel={() => void run({ type: 'cancel' })} />
  </>
}
