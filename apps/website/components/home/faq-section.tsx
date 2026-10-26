/**
 * [INPUT]: Locale, page placement, localized FAQ/security copy, shared service policies/support facts and native disclosures.
 * [OUTPUT]: FaqSection with identical common answers on homepage/pricing and pricing-only native policy anchors.
 * [POS]: Shared common FAQ composition; the homepage adds progressive reveal and pricing uses its information-page spacing.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale, SiteCatalog } from '@/lib/i18n'
import { REPO } from '@/lib/release'
import { getServiceCatalog, SERVICE } from '@/lib/services'
import { FaqList } from '../faq-list'
import { Reveal } from '../motion'

export function FaqSection({ locale, copy, page = 'home' }: { locale: Locale; copy: SiteCatalog['faq']; page?: 'home' | 'pricing' }) {
  const policies = getServiceCatalog(locale).faq
  const pricing = page === 'pricing'
  const Section = pricing ? 'section' : Reveal
  const prefix = `${page}-faq`
  const titleId = pricing ? 'pricing-common-faq-title' : 'faq-title'
  return <Section className={pricing ? 'service-faq common-faq home-faq' : 'section section-rule home-faq'} id={pricing ? 'pricing-common-faq' : 'faq'} aria-labelledby={titleId}>
    <div className="home-faq-heading">
      <p className="eyebrow">FAQ</p>
      <h2 className="home-faq-title" id={titleId}>{copy.title}</h2>
      <p className="home-faq-intro">{copy.intro}</p>
    </div>
    <FaqList name={prefix} items={[
      { id: `${prefix}-free`, question: copy.freeQuestion, answer: <p id={pricing ? 'service-free' : undefined}>{policies.find(item => item.id === 'free')!.a}</p> },
      { id: `${prefix}-trial`, question: copy.trialQuestion, answer: <p id={pricing ? 'service-trial' : undefined}>{policies.find(item => item.id === 'trial')!.a}</p> },
      { id: `${prefix}-security`, question: copy.security.q, answer: <p>{copy.security.a}</p> },
      { id: `${prefix}-refunds`, question: copy.refundQuestion, answer: <p id={pricing ? 'service-refunds' : undefined}>{policies.find(item => item.id === 'refunds')!.a}</p> },
      { id: pricing ? 'support' : 'home-faq-support', question: copy.helpTitle, answer: <p className="home-faq-support">
        {copy.helpBody.split(/(\{contact\}|\{technical\})/u).map((part, index) => {
          if (part === '{contact}') return <a key={index} href={`mailto:${SERVICE.supportEmail}`}>{copy.contact}</a>
          if (part === '{technical}') return <a key={index} href={`${REPO}/issues`}>{copy.technical}</a>
          return part
        })}
      </p> },
    ]} />
  </Section>
}
