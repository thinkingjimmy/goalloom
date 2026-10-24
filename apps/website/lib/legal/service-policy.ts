/**
 * [INPUT]: Base localized legal document, finalized billing policy and current publication copy.
 * [OUTPUT]: Updated legal catalog with current data flows and launch-scoped Plus policy sections.
 * [POS]: Single policy amendment shared by all locales; retains license and local-data sections.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ServiceCatalog } from '../services/types'
import type { LegalCatalog } from './types'
export function applyServicePolicy(base: LegalCatalog, service: ServiceCatalog): LegalCatalog {
 const copy = service.legal
 return { ...base, updated: copy.updated, contactText: copy.support,
  privacy: { ...base.privacy, intro: copy.privacyIntro, sections: [
   ...base.privacy.sections.map(section => {
    if (section.id === 'google') return { ...section, title: copy.accountTitle, paragraphs: [copy.account, ...section.paragraphs.slice(1)] }
    if (section.id === 'ai') return { ...section, paragraphs: copy.hosted }
    if (section.id === 'sharing') return { ...section, paragraphs: [copy.sources, ...section.paragraphs.slice(1)] }
    if (section.id === 'retention') return { ...section, paragraphs: [...section.paragraphs, copy.retention] }
    return section
   }), { id: 'payments', title: copy.paymentsTitle, paragraphs: copy.payments },
   ...service.policy.sections.filter(section => ['cloud-retention', 'deletion', 'records'].includes(section.id)).map(section => ({ ...section, id: `billing-${section.id}` })),
  ] },
  terms: { ...base.terms, intro: copy.termsIntro, sections: [
   ...base.terms.sections.map(section => section.id === 'optional' ? { ...section, paragraphs: [service.summaryBody, service.statusBody] } : section),
   { id: 'paid-service', title: copy.paidTitle, paragraphs: [...copy.paid, copy.retention] },
   ...service.policy.sections.map(section => ({ ...section, id: `billing-${section.id}` })),
  ] },
 }
}
