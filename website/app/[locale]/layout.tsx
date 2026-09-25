/**
 * [INPUT]: Depends on ../globals.css, lib/i18n and components/site-document
 * [OUTPUT]: Root layout of the four prefixed locale trees with a build-time html lang
 * [POS]: app's prefixed-language route tree; unknown prefixes are not generated
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import '../globals.css'
import { notFound } from 'next/navigation'
import { SiteDocument } from '@/components/site-document'
import { PREFIXED_LOCALES, isLocale } from '@/lib/i18n'

export const dynamicParams = false
export const generateStaticParams = () => PREFIXED_LOCALES.map(locale => ({ locale }))

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <SiteDocument locale={locale}>{children}</SiteDocument>
}
