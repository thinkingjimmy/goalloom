/**
 * [INPUT]: Depends on ./boot, ./theme and one statically known Locale
 * [OUTPUT]: Exports SiteDocument, the shared <html> root of both route trees
 * [POS]: components' document boundary: build-time html lang, pre-paint theme/platform script. No analytics or
 *        third-party requests are loaded.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from '@/lib/i18n/locale'
import { BOOT } from './boot'
import { ThemeRuntime } from './theme'

export function SiteDocument({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <html lang={locale} data-theme="light" data-theme-mode="auto" data-platform="mac" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <ThemeRuntime />
        {children}
      </body>
    </html>
  )
}
