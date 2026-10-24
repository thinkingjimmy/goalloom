/**
 * [INPUT]: Unique control id and localized service billing-cycle labels.
 * [OUTPUT]: BillingCycle, a native monthly/yearly radio group styled as a segmented control.
 * [POS]: Shared homepage/pricing-page control; works without hydration or payment side effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ServiceCatalog } from '@/lib/services'

export function BillingCycle({ id, copy }: { id: string; copy: Pick<ServiceCatalog, 'billingCycle' | 'monthly' | 'yearly'> }) {
  return <fieldset className="billing-cycle">
    <legend className="sr-only">{copy.billingCycle}</legend>
    {(['month', 'year'] as const).map(cycle => <label key={cycle} htmlFor={`${id}-${cycle}`}>
      <input className="cycle-radio sr-only" id={`${id}-${cycle}`} name={id} type="radio" value={cycle} defaultChecked={cycle === 'month'} />
      <span>{cycle === 'month' ? copy.monthly : copy.yearly}</span>
    </label>)}
  </fieldset>
}
