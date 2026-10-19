/**
 * [INPUT]: Shared LegalPage, legalMetadata and English copy.
 * [OUTPUT]: Static terms document and page-specific metadata.
 * [POS]: English/x-default legal route.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { LegalPage } from '@/components/legal-page'
import { legalMetadata } from '@/lib/legal'

export const metadata = legalMetadata('en', 'terms')
export default function Page() {
  return <LegalPage locale="en" kind="terms" />
}
