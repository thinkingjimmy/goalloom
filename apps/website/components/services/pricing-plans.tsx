/**
 * [INPUT]: Locale, unique plan id, heading level, optional Free billing note and shared pricing/download controls.
 * [OUTPUT]: PricingPlans with aligned Free/Plus cards, native billing, annual savings, BYOK-fee/AI-encryption disclosures and trial-FAQ navigation.
 * [POS]: Shared price cards for homepage and pricing page; no purchase or trial activation side effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, localizedPath, type Locale } from '@/lib/i18n'
import { getServiceCatalog, SERVICE } from '@/lib/services'
import { DownloadButton } from '../download-button'
import { Icon } from '../icons'
import { InfoDisclosure } from '../info-disclosure'
import { BillingCycle } from './billing-cycle'

export function PricingPlans({ locale, id, headingAs: Heading, showFreeBilling = true }: { locale: Locale; id: string; headingAs: 'h2' | 'h3'; showFreeBilling?: boolean }) {
  const BenefitsHeading = Heading === 'h2' ? 'h3' : 'h4'
  const service = getServiceCatalog(locale)
  const copy = service.homePricing
  const catalog = getCatalog(locale)
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const monthly = money.format(SERVICE.monthlyCents / 100)
  const annual = money.format(SERVICE.annualCents / 100)
  const savingCents = SERVICE.monthlyCents * 12 - SERVICE.annualCents
  const savingPercent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(savingCents / (SERVICE.monthlyCents * 12))
  const annualSavings = copy.annualSavings.replace('{amount}', money.format(savingCents / 100)).replace('{percent}', savingPercent)

  return <div className="home-plan-grid">
    <article className="home-plan home-plan-free" aria-labelledby={`${id}-free-title`}>
      <div className="home-plan-top"><Heading id={`${id}-free-title`}>{service.free}</Heading></div>
      <p className="home-plan-description">{copy.freeDescription}</p>
      <p className="home-plan-price">$0 <small>{copy.freePeriod}</small></p>
      {showFreeBilling && <p className="home-plan-billing">{copy.freeBilling}</p>}
      <DownloadButton copy={catalog.download} compactLabel={service.download} />
      <div className="home-plan-benefits">
        <BenefitsHeading>{copy.freeIncludes}</BenefitsHeading>
          <ul>{copy.freeFeatures.map((feature, index) => <li key={feature}><Icon name="check" size={18} /><span className="home-plan-feature-title">{feature}{index === copy.freeFeatures.length - 1 && <InfoDisclosure label={copy.byokInfoLabel} text={copy.byokNote} />}</span></li>)}</ul>
      </div>
    </article>
    <article className="home-plan home-plan-plus" aria-labelledby={`${id}-plus-title`}>
      <div className="home-plan-top"><Heading id={`${id}-plus-title`}>{service.plus}</Heading></div>
      <BillingCycle id={`${id}-cycle`} copy={service} />
      <p className="home-plan-price home-price-month">{monthly} <small>{service.perMonth}</small></p>
      <p className="home-plan-price home-price-year">{annual} <small>{service.perYear}</small></p>
      <p className="home-plan-billing"><span className="home-annual-saving">{annualSavings}</span></p>
      <a className="service-action" href={`${localizedPath(locale, '/pricing/')}#service-trial`}>{copy.tryNow}</a>
      <div className="home-plan-benefits">
        <BenefitsHeading>{copy.plusIncludes}</BenefitsHeading>
        <ul>{copy.plusFeatures.map(feature => <li key={feature.id}><Icon name="check" size={18} /><span><span className="home-plan-feature-title"><strong>{feature.title}</strong>{feature.id === 'ai' && <InfoDisclosure label={copy.encryptionInfoLabel} text={copy.encryptionNote} />}</span><small>{feature.description}</small></span></li>)}</ul>
      </div>
    </article>
  </div>
}
