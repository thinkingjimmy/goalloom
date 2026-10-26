/**
 * [INPUT]: Account-bound trusted billing projection and finite main-process actions.
 * [OUTPUT]: Explicit trial/purchase, original-request recovery and confirmed renewal management.
 * [POS]: Shared Plus card for Sync, AI settings and first-run setup. It never starts sync or enables AI.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { BillingAction, BillingCycle, BillingState } from '../../../../shared/contracts/billing'
import { billingCatalog } from '../../../../shared/i18n/billing'
import { currentLocale } from '../../../i18n'
import { SettingsButton } from '../../../components/ui/button'
import { SettingsGroup, SettingsRow } from './parts'

export function billingErrorText(error: BillingState['error']): string | null {
  const t = billingCatalog[currentLocale()]
  if (!error) return null
  if (error === 'authentication_failed') return t.auth
  if (error === 'billing_configuration') return t.configuration
  if (error === 'upgrade_required') return t.upgrade
  if (error === 'network') return t.network
  if (error === 'storage') return t.storage
  if (error === 'billing_pending') return t.pending
  if (error === 'checkout_expired') return t.expiredCheckout
  if (error === 'continuation_expired') return t.continuationExpired
  if (['billing_review_required', 'billing_request_conflict', 'billing_source_mismatch', 'subscription_exists'].includes(error)) return t.review
  return t.unavailable
}

export function BillingCard({ state, run }: { state: BillingState | null; run: (action: BillingAction) => Promise<unknown> }) {
  const t = billingCatalog[currentLocale()]
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [confirmation, setConfirmation] = useState<{ action: BillingAction; signature: string } | null>(null)
  const root = useRef<HTMLElement>(null), backButton = useRef<HTMLButtonElement>(null)
  const restoreAction = useRef<string | null>(null)
  const focusedConfirmation = useRef<BillingAction | null>(null)
  const owner = useRef<string | null>(state?.accountId ?? null)
  const [submitted, setSubmitted] = useState(false)
  const access = state?.access, pending = state?.pending
  const busy = state?.busy === true, blocked = busy || !!pending
  const subscription = access?.subscriptions.find(row => row.cycle !== null && !['canceled', 'incomplete_expired'].includes(row.status))
  const signature = JSON.stringify([state?.accountId, state?.environment, access?.status, access?.prices, subscription])
  const confirm = confirmation?.signature === signature ? confirmation.action : null
  useEffect(() => {
    if (owner.current !== (state?.accountId ?? null)) { owner.current = state?.accountId ?? null; restoreAction.current = null }
    if (confirmation && confirmation.signature !== signature) setConfirmation(null)
    if (confirm && focusedConfirmation.current !== confirm) backButton.current?.focus()
    focusedConfirmation.current = confirm
    if (!confirm && restoreAction.current && !busy) {
      const fallback = ['cancel', 'resume'].includes(restoreAction.current) ? subscription?.cancelAtPeriodEnd ? 'resume' : 'cancel' : 'switch'
      const control = root.current?.querySelector<HTMLButtonElement>(`[data-billing-action="${restoreAction.current}"]`)
        ?? root.current?.querySelector<HTMLButtonElement>(`[data-billing-action="${fallback}"]`)
      if (control && !control.disabled) control.focus()
      restoreAction.current = null
    }
  }, [confirm, confirmation, signature, busy, state?.accountId, subscription?.cancelAtPeriodEnd])
  const openConfirmation = (action: BillingAction) => setConfirmation({ action, signature })
  const closeConfirmation = () => { restoreAction.current = confirm?.type ?? null; setConfirmation(null) }
  const date = (value: string) => new Date(value).toLocaleString(currentLocale() === 'zh' ? 'zh-CN' : currentLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  const money = (amount: number, currency = 'USD') => new Intl.NumberFormat(currentLocale() === 'zh' ? 'zh-CN' : currentLocale(), { style: 'currency', currency }).format(amount / 100)
  const price = access?.prices[cycle]
  const execute = async (action: BillingAction) => {
    setSubmitted(false)
    const result = await run(action)
    setSubmitted(true)
    return result
  }
  const confirmNote = confirm?.type === 'cancel' ? t.cancelNote : confirm?.type === 'resume' ? t.resumeNote : confirm?.type === 'remove_switch' ? t.removeSwitchNote : t.switchNote
  const confirmCycle = confirm?.type === 'switch' ? confirm.cycle : confirm?.type === 'remove_switch' ? subscription?.cycle : subscription?.nextCycle ?? subscription?.cycle
  const changedPrice = confirmCycle ? access?.prices[confirmCycle] : null
  return <section ref={root} className="billing-card flex flex-col gap-3" aria-label={t.title} aria-busy={busy}>
    <SettingsGroup title={t.title}>
      <SettingsRow title={access ? t[access.status] : busy ? t.loading : t.unknown} note={t.description}>
        <SettingsButton type="button" disabled={busy || !state?.accountId} onClick={() => void execute({ type: 'refresh' })}>{t.refresh}</SettingsButton>
      </SettingsRow>
      {access?.effectiveEnd && <SettingsRow title={access.grace ? t.grace : subscription?.cancelAtPeriodEnd ? t.cancelled : t.end} note={date(access.effectiveEnd)} />}
      {subscription?.endsAt && !subscription.cancelAtPeriodEnd && <SettingsRow title={t.renews} note={date(subscription.endsAt)}>
        {subscription.nextAmount !== null && <span className="text-[13px] text-soft">{t.nextPrice}: {money(subscription.nextAmount, subscription.nextCurrency ?? 'USD')} · {(subscription.nextCycle ?? subscription.cycle) === 'annual' ? t.annual : t.monthly}</span>}
      </SettingsRow>}
      {access?.trialEligible && !pending && <SettingsRow title={t.trialNote}>
        <SettingsButton type="button" variant="primary" disabled={blocked} onClick={() => void execute({ type: 'claim_trial' })}>{t.trial}</SettingsButton>
      </SettingsRow>}
      {access && !subscription && !pending && access.status !== 'verification_pending' && <div className="flex flex-col gap-3 px-4.5 py-3">
        <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0" disabled={blocked}>
          <legend className="sr-only">{t.subscribe}</legend>
          {(['monthly', 'annual'] as const).map(value => <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="radio" name="billing-cycle" value={value} checked={cycle === value} onChange={() => setCycle(value)} />{value === 'monthly' ? t.monthly : t.annual} · {money(access.prices[value].amount)}
          </label>)}
        </fieldset>
        <p className="m-0 text-[12px] leading-relaxed text-muted-foreground">{t.priceNote}{access.status === 'trialing' && <> {t.earlyPurchase}</>}</p>
        <div className="flex justify-end"><SettingsButton type="button" disabled={blocked} onClick={() => void execute({ type: 'checkout', cycle })}>{t.subscribe}{price ? ` · ${money(price.amount)} / ${cycle === 'annual' ? t.annual : t.monthly}` : ''}</SettingsButton></div>
      </div>}
      {subscription && !confirm && <div className="flex flex-wrap justify-end gap-2 px-4.5 py-3">
        <SettingsButton type="button" disabled={blocked} onClick={() => void execute({ type: 'portal' })}>{t.manage}</SettingsButton>
        <SettingsButton type="button" data-billing-action={subscription.cancelAtPeriodEnd ? 'resume' : 'cancel'} disabled={blocked} onClick={() => openConfirmation({ type: subscription.cancelAtPeriodEnd ? 'resume' : 'cancel' })}>{subscription.cancelAtPeriodEnd ? t.resume : t.cancelRenewal}</SettingsButton>
        {!subscription.cancelAtPeriodEnd && <SettingsButton type="button" data-billing-action="switch" disabled={blocked} onClick={() => openConfirmation({ type: 'switch', cycle: subscription.cycle === 'monthly' ? 'annual' : 'monthly' })}>{t.switchCycle}</SettingsButton>}
        {!subscription.cancelAtPeriodEnd && subscription.nextCycle && subscription.nextCycle !== subscription.cycle && <SettingsButton type="button" data-billing-action="remove_switch" disabled={blocked} onClick={() => openConfirmation({ type: 'remove_switch' })}>{t.removeSwitch}</SettingsButton>}
      </div>}
      {confirm && <div className="flex flex-col gap-3 px-4.5 py-3" role="group" aria-label={t.confirm} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeConfirmation() }
      }}>
        <p className="m-0 text-[13px] leading-relaxed text-soft">{confirmNote}</p>
        {confirm.type !== 'cancel' && changedPrice && <p className="m-0 text-[13px] text-foreground">{t.nextPrice}: {money(changedPrice.amount, changedPrice.currency)} · {confirmCycle === 'annual' ? t.annual : t.monthly}{subscription?.endsAt ? ` · ${date(subscription.endsAt)}` : ''}</p>}
        <div className="flex justify-end gap-2">
          <SettingsButton ref={backButton} type="button" onClick={closeConfirmation}>{t.back}</SettingsButton>
          <SettingsButton type="button" variant="primary" aria-disabled={blocked} className="aria-disabled:opacity-50" onClick={() => { if (blocked) return; const action = confirm; closeConfirmation(); void execute(action) }}>{t.confirm}</SettingsButton>
        </div>
      </div>}
    </SettingsGroup>
    {pending && <div className="flex flex-col gap-2 text-[12px] leading-relaxed text-muted-foreground" role="status">
      <p className="m-0">{pending.action === 'checkout' && pending.returnToThisDevice === false ? t.otherDevice : pending.browserOpened ? t.browser : t.pending}</p>
      <div className="flex justify-end"><SettingsButton type="button" disabled={busy} onClick={() => void execute({ type: 'recover' })}>{pending.action === 'checkout' ? t.recover : t.refresh}</SettingsButton></div>
    </div>}
    {state?.error && <p role="alert" className="m-0 text-[12px] leading-relaxed text-destructive">{billingErrorText(state.error)}</p>}
    {submitted && !busy && !state?.error && !pending && <p role="status" className="m-0 text-[12px] text-muted-foreground">{t.saved}</p>}
    <p className="m-0 text-[12px] leading-relaxed text-muted-foreground">{t.separate}</p>
  </section>
}
