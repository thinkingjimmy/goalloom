/**
 * [INPUT]: Depends on ../globals.css and components/site-document
 * [OUTPUT]: Root layout of the unprefixed English tree (also x-default)
 * [POS]: app's default-language route tree
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import '../globals.css'
import { SiteDocument } from '@/components/site-document'

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return <SiteDocument locale="en">{children}</SiteDocument>
}
