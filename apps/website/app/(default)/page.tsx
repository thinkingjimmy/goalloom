/**
 * [INPUT]: Depends on lib/i18n, lib/i18n/metadata and components/home/home-page
 * [OUTPUT]: The English home page and its metadata
 * [POS]: app's canonical English and x-default entry
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { HomePage } from '@/components/home/home-page'
import { getCatalog } from '@/lib/i18n'
import { buildMetadata } from '@/lib/i18n/metadata'

export const metadata = buildMetadata('en', getCatalog('en'))

export default function EnglishHome() {
  return <HomePage locale="en" />
}
