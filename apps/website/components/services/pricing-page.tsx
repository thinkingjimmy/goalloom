/**
 * [INPUT]: Localized service copy, publication snapshot, shared common FAQ/price cards and site navigation.
 * [OUTPUT]: PricingPage with homepage common questions, a separate billing-only FAQ and native policy anchors; standalone billing support.
 * [POS]: Informational service surfaces, separate from future trusted billing operations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, localizedPath, type Locale } from '@/lib/i18n'
import { getServiceCatalog, SERVICE } from '@/lib/services'
import { absoluteUrl } from '@/lib/seo/site'
import { REPO } from '@/lib/release'
import { SiteHeader } from '../site-header'
import { SiteFooter } from '../site-footer'
import { FaqList } from '../faq-list'
import { FaqSection } from '../home/faq-section'
import { PricingPlans } from './pricing-plans'

const BILLING_QUESTION_IDS = new Set(['purchase', 'renewal', 'expiry', 'changes', 'grace'])

export function ServiceSupport({ locale }: { locale: Locale }) {
  const copy = getServiceCatalog(locale)
  return <section id="support" className="service-support" aria-labelledby="support-title">
    <div><h2 id="support-title">{copy.support}</h2><p>{copy.supportBody}</p><a href={`mailto:${SERVICE.supportEmail}`}>{SERVICE.supportEmail}</a><a href={`${REPO}/issues`}>{copy.technical}</a></div>
    <div id="manage"><h2>{copy.manageTitle}</h2><p>{copy.manageBody}</p><ul><li>{copy.stripeManage}</li><li>{copy.appleManage}</li></ul></div>
  </section>
}

export function PricingPage({ locale }: { locale: Locale }) {
  const t = getCatalog(locale), copy = getServiceCatalog(locale)
  const url = absoluteUrl(localizedPath(locale, '/pricing/'))
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', url, name: copy.meta.title, description: copy.meta.description, inLanguage: locale,
    mainEntity: { '@type': 'Service', name: 'Goalloom Plus', description: copy.summaryBody, provider: { '@type': 'Organization', name: SERVICE.operator } },
  }).replace(/</gu, '\\u003c')
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
    <SiteHeader locale={locale} copy={t.nav} className="site-bar" logicalPath="/pricing/" />
    <main className="service-main" data-stage={SERVICE.stage}>
      <header className="service-intro"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.heading}</h1><p>{copy.intro}</p></header>
      <PricingPlans locale={locale} id="pricing" headingAs="h2" />
      <FaqSection locale={locale} copy={t.faq} page="pricing" />
      <section className="service-faq billing-faq home-faq" aria-labelledby="service-faq-title">
        <div className="home-faq-heading"><p className="eyebrow">FAQ</p><h2 className="home-faq-title" id="service-faq-title">{copy.faqTitle}</h2></div>
        <FaqList name="pricing-billing-faq" items={[
          ...copy.faq.filter(item => BILLING_QUESTION_IDS.has(item.id)).map(item => ({ question: item.q, answer: <p id={`service-${item.id}`}>{item.a}</p> })),
          { id: 'manage', question: copy.faqManageQuestion, answer: <div className="faq-answer"><p>{copy.manageBody}</p><ul><li>{copy.stripeManage}</li><li>{copy.appleManage}</li></ul></div> },
        ]} />
      </section>
    </main>
    <SiteFooter locale={locale} t={t} logicalPath="/pricing/" />
  </>
}
