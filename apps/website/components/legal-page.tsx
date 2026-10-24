/**
 * [INPUT]: Localized legal copy, shared navigation and public site identity.
 * [OUTPUT]: Static LegalPage with contents, contact and provider/purchase-policy links.
 * [POS]: Shared rendering for the ten privacy/terms pages; no analytics or remote assets.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, localizedPath, type Locale } from '@/lib/i18n'
import { getLegalCatalog, LEGAL_DATE, LEGAL_EMAIL, type LegalKind } from '@/lib/legal'
import { absoluteUrl } from '@/lib/seo/site'
import { REPO } from '@/lib/release'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

const resources = [
  ['Apple Privacy Policy', 'https://www.apple.com/legal/privacy/'],
  ['Stripe Privacy Policy', 'https://stripe.com/privacy'],
  ['RevenueCat Privacy Policy', 'https://www.revenuecat.com/privacy'],
  ['Apple subscriptions', 'https://apps.apple.com/account/subscriptions/'],
  ['Apple refunds', 'https://support.apple.com/118223'],
  ['TypeSafe Privacy Policy', 'https://typesafe.ai/legal/privacy-policy'],
  ['DeepInfra Privacy Policy', 'https://deepinfra.com/privacy'],
  ['Vercel AI Gateway', 'https://vercel.com/docs/ai-gateway'],
  ['Google Privacy Policy', 'https://policies.google.com/privacy'],
  ['Google API Services User Data Policy', 'https://developers.google.com/terms/api-services-user-data-policy'],
  ['Supabase Privacy Policy', 'https://supabase.com/privacy'],
  ['Vercel Privacy Notice', 'https://vercel.com/legal/privacy-notice'],
  ['OpenRouter Privacy Policy', 'https://openrouter.ai/privacy'],
  ['GitHub Privacy Statement', 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'],
  ['MIT License', `${REPO}/blob/main/LICENSE`],
  ['GNU AGPL-3.0-only', `${REPO}/blob/main/supabase/LICENSE`],
] as const

export function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const t = getCatalog(locale)
  const copy = getLegalCatalog(locale)
  const document = copy[kind]
  const logicalPath = `/${kind}/`
  const url = absoluteUrl(localizedPath(locale, logicalPath))
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url,
    name: `${document.title} · Goalloom`, description: document.description,
    inLanguage: locale, dateModified: LEGAL_DATE,
    isPartOf: { '@type': 'WebSite', '@id': absoluteUrl('/#website'), url: absoluteUrl('/'), name: 'Goalloom' },
  }).replace(/</gu, '\\u003c')
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    <SiteHeader locale={locale} copy={t.nav} className="site-bar legal-header" logicalPath={logicalPath} />
    <main className="legal-main">
      <header className="legal-intro">
        <p className="eyebrow">Goalloom</p>
        <h1>{document.title}</h1>
        <p className="legal-date"><time dateTime={LEGAL_DATE}>{copy.updated}</time></p>
        <p className="legal-summary">{document.intro}</p>
      </header>
      <div className="legal-layout">
        <nav className="legal-contents" aria-label={copy.contents}>
          <h2>{copy.contents}</h2>
          <ol>
            {document.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}
            <li><a href="#contact">{copy.contact}</a></li>
          </ol>
        </nav>
        <article className="legal-article" aria-label={document.title}>
          {document.sections.map(section => <section className="legal-section" key={section.id} id={section.id} aria-labelledby={`title-${section.id}`}>
            <h2 id={`title-${section.id}`}>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>)}
          <section className="legal-section" id="contact" aria-labelledby="title-contact">
            <h2 id="title-contact">{copy.contact}</h2>
            <p>{copy.contactText}</p>
            <p><a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a></p>
          </section>
          <section className="legal-section legal-resources" aria-labelledby="title-resources">
            <h2 id="title-resources">{copy.resources}</h2>
            <ul>
              <li><a href={localizedPath(locale, kind === 'privacy' ? '/terms/' : '/privacy/')}>{kind === 'privacy' ? t.footer.terms : t.footer.privacy}</a></li>
              {resources.map(([label, href]) => <li key={href}><a href={href} hrefLang="en">{label}</a></li>)}
            </ul>
          </section>
        </article>
      </div>
    </main>
    <SiteFooter locale={locale} t={t} logicalPath={logicalPath} />
  </>
}
