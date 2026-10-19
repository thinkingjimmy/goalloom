/**
 * [INPUT]: No runtime dependencies.
 * [OUTPUT]: LegalDocument, LegalCatalog, LegalKind, public contact and effective date.
 * [POS]: Shared content contract for the five localized legal catalogs and static pages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export type LegalKind = 'privacy' | 'terms'
export type LegalDocument = {
  title: string
  description: string
  intro: string
  sections: Array<{ id: string; title: string; paragraphs: string[] }>
}
export type LegalCatalog = {
  updated: string
  contents: string
  contact: string
  contactText: string
  resources: string
  privacy: LegalDocument
  terms: LegalDocument
}
export const LEGAL_EMAIL = 'hellojimmywong@gmail.com'
export const LEGAL_DATE = '2026-10-19'
