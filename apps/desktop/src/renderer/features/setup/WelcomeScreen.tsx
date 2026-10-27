/**
 * [INPUT]: Localized first-run copy, bundled paper illustrations and provider-scoped login state/actions.
 * [OUTPUT]: Local-first welcome with expanded Google/Apple actions and a cancellable browser wait; explicit back-entry motion, no setup or sync writes.
 * [POS]: Presentational first page of StartGate, separate from the calendar and password screens.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { AuthProvider } from '../../../shared/contracts/sync'
import { useRef, type MouseEventHandler } from 'react'
import { messages, settingsMessages as settings } from '../../i18n'
import { AuthMark } from '../../components/AuthMark'
import { Button } from '../../components/ui/button'
import appIcon from '../../assets/app-icon.png'
import localArt from '../../assets/onboarding/local.png'
import directionArt from '../../assets/onboarding/direction.png'
import syncArt from '../../assets/onboarding/sync.png'
import aiArt from '../../assets/onboarding/ai.png'
import { useEntryMotion, type EntryMotion } from './use-setup-motion'
import './welcome.css'

export function ChoiceScreen({ waiting, provider, busy = false, entryMotion = null, onLocal, onSignIn, onCancel }: {
  waiting: boolean; provider?: AuthProvider; busy?: boolean; entryMotion?: EntryMotion; onLocal: MouseEventHandler<HTMLButtonElement>; onSignIn: (provider: AuthProvider) => void; onCancel: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useEntryMotion(root, entryMotion)
  const copy = messages.start
  const benefits = [
    { image: localArt, label: copy.offline, width: 320, height: 227 },
    { image: directionArt, label: copy.connected, width: 269, height: 270 },
    { image: syncArt, label: copy.encrypted, width: 320, height: 237 },
    { image: aiArt, label: copy.optionalAi, width: 320, height: 267 },
  ]
  return <div ref={root} className="onboarding start-entry welcome-entry flex-1 min-h-0 flex flex-col">
    <main className="welcome-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="start-cards welcome-content">
        <section className="welcome-form min-w-0" data-entry-part="form" aria-labelledby="welcome-title">
          <img className="welcome-logo block size-16 rounded-2xl mb-4" src={appIcon} alt="" draggable={false} />
          <h1 id="welcome-title" className="welcome-title m-0 mb-7 text-[28px] leading-[1.3] font-semibold tracking-[-.025em]">{copy.title}</h1>
          <section className="welcome-group" aria-labelledby="welcome-local">
            <h2 id="welcome-local" className="m-0 text-[15px] leading-normal font-medium">{copy.localTitle}</h2>
            <p className="mt-1.5 mb-3 text-[12.5px] leading-[1.75] text-muted-foreground">{copy.localNote}</p>
            <Button className="start-local welcome-primary w-full" disabled={waiting || busy} onClick={onLocal}>{copy.local}</Button>
          </section>
          <section className="welcome-group welcome-account mt-6 pt-5 border-t border-hairline" aria-labelledby="welcome-account" data-waiting={waiting || undefined}>
            <h2 id="welcome-account" className="m-0 text-[15px] leading-normal font-medium">{copy.accountTitle}</h2>
            <p className="mt-1.5 mb-3.5 text-[12px] leading-[1.75] text-muted-foreground">{copy.syncNote}</p>
            <div className="start-providers flex flex-col gap-2">
              {(['google', 'apple'] as const).map(id => <Button variant="outline" className="welcome-provider w-full" key={id} disabled={waiting || busy} onClick={() => onSignIn(id)}>
                <AuthMark provider={id} />{id === 'apple' ? copy.apple : copy.google}
              </Button>)}
            </div>
            {waiting && <div className="start-wait mt-3 flex flex-wrap items-center gap-2 text-[13px] leading-relaxed text-soft" role="status">
              <span className="start-spinner shrink-0" aria-hidden="true" /><span>{provider === 'apple' ? copy.apple : copy.google} · {copy.browser}</span>
              <button type="button" className="start-quiet min-h-11 min-w-11 px-2 text-[13px] text-muted-foreground" onClick={onCancel}>{settings.sync.cancel}</button>
            </div>}
          </section>
        </section>
        <div className="welcome-benefits" data-entry-part="art">
          <ul className="welcome-benefit-grid m-0 p-0 list-none">
            {benefits.map(benefit => <li className="welcome-benefit" key={benefit.image}>
              <div className="welcome-art"><img src={benefit.image} width={benefit.width} height={benefit.height} alt="" draggable={false} /></div>
              <p className="m-0 text-center text-[14px] leading-[1.6] font-medium">{benefit.label}</p>
            </li>)}
          </ul>
        </div>
      </div>
    </main>
  </div>
}
