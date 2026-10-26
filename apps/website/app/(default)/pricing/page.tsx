/**
 * [INPUT]: Shared service page and locale metadata.
 * [OUTPUT]: Static service-information route.
 * [POS]: Website route tree; billing never authorizes service.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { PricingPage } from '@/components/services/pricing-page'
import { serviceMetadata } from '@/lib/services/metadata'
export const metadata = serviceMetadata('en', '/pricing/')
export default function Page() { return <PricingPage locale="en" /> }
