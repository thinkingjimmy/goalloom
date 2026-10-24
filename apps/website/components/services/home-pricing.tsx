/**
 * [INPUT]: Localized service heading and shared price cards.
 * [OUTPUT]: HomePricing with a left heading and aligned plans, omitting the homepage Free billing note.
 * [POS]: Homepage pricing section; shared card behavior belongs to PricingPlans.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from '@/lib/i18n'
import { getServiceCatalog } from '@/lib/services'
import { PricingPlans } from './pricing-plans'

export function HomePricing({ locale }: { locale: Locale }) {
  const service = getServiceCatalog(locale)
  const copy = service.homePricing
  return <section className="service-summary home-pricing" aria-labelledby="home-pricing-title">
    <header className="home-pricing-heading">
      <p className="eyebrow">{service.eyebrow}</p>
      <h2 id="home-pricing-title">{copy.title}</h2>
      <p>{copy.body}</p>
    </header>
    <PricingPlans locale={locale} id="home" headingAs="h3" showFreeBilling={false} />
  </section>
}
