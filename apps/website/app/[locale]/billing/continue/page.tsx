/**
 * [INPUT]: Shared service page and locale metadata.
 * [OUTPUT]: Static service-information route.
 * [POS]: Website route tree; billing never authorizes service.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { BillingPage } from '@/components/services/billing-page'
import { serviceMetadata } from '@/lib/services/metadata'
import { notFound } from 'next/navigation'
import { isLocale } from '@/lib/i18n'
type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props) {
 const { locale } = await params
 return isLocale(locale) ? serviceMetadata(locale, '/billing/continue/') : {}
}
export default async function Page({ params }: Props) {
 const { locale } = await params
 if (!isLocale(locale)) notFound()
 return <BillingPage locale={locale} kind="continue" />
}
