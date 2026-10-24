/**
 * [INPUT]: Shared service page and locale metadata.
 * [OUTPUT]: Static service-information route.
 * [POS]: Website route tree; billing never authorizes service.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { BillingPage } from '@/components/services/billing-page'
import { serviceMetadata } from '@/lib/services/metadata'
export const metadata = serviceMetadata('en', '/billing/return/')
export default function Page() { return <BillingPage locale="en" kind="return" /> }
