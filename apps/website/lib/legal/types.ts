/**
 * [INPUT]: Shared service policy date and public contact snapshot.
 * [OUTPUT]: LegalDocument, LegalCatalog, LegalKind, public contact and effective date.
 * [POS]: Shared content contract for the five localized legal catalogs and static pages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SERVICE } from '../services/release'

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
export const LEGAL_EMAIL = SERVICE.supportEmail
export const LEGAL_DATE = SERVICE.policyDate
