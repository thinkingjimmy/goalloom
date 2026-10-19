/**
 * [INPUT]: Shared LegalPage, legalMetadata and validated locale parameters.
 * [OUTPUT]: Static privacy document and page-specific metadata.
 * [POS]: Prefixed-language legal route.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { LegalPage } from '@/components/legal-page'
import { legalMetadata } from '@/lib/legal'
import { notFound } from 'next/navigation'
import { isLocale } from '@/lib/i18n'

type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  return isLocale(locale) ? legalMetadata(locale, 'privacy') : {}
}
export default async function Page({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <LegalPage locale={locale} kind="privacy" />
}
