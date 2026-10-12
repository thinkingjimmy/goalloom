/**
 * [INPUT]: Depends on lib/i18n, lib/i18n/metadata and components/home/home-page
 * [OUTPUT]: The localized home pages (zh-CN, ja, es, fr) and their metadata
 * [POS]: app's canonical prefixed-language home entry
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { notFound } from 'next/navigation'
import { HomePage } from '@/components/home/home-page'
import { getCatalog, isLocale } from '@/lib/i18n'
import { buildMetadata } from '@/lib/i18n/metadata'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  return isLocale(locale) ? buildMetadata(locale, getCatalog(locale)) : {}
}

export default async function LocalizedHome({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <HomePage locale={locale} />
}
