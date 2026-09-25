/**
 * [INPUT]: The fresh static export in out/
 * [OUTPUT]: Exit code 0/1 with one line per broken page
 * [POS]: website's build gate (runs after `next build`): every locale page must ship its own canonical, all
 *        reciprocal hreflang alternates, a description, Open Graph image and JSON-LD; sitemap and robots must exist
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const out = resolve(import.meta.dirname, '..', 'out')
const SITE = 'https://goalloom.com'
const PAGES = { en: '/', 'zh-CN': '/zh-CN/', ja: '/ja/', es: '/es/', fr: '/fr/' }
const problems = []

for (const [locale, path] of Object.entries(PAGES)) {
  const file = join(out, path, 'index.html')
  if (!existsSync(file)) { problems.push(`${path}: missing`); continue }
  const html = readFileSync(file, 'utf8')
  const need = (ok, what) => { if (!ok) problems.push(`${path}: ${what}`) }
  need(html.includes(`<html lang="${locale}"`), 'html lang')
  need(html.includes(`<link rel="canonical" href="${SITE}${path}"`), 'canonical')
  for (const [other, otherPath] of Object.entries(PAGES)) need(html.includes(`hrefLang="${other}" href="${SITE}${otherPath}"`), `hreflang ${other}`)
  need(html.includes(`hrefLang="x-default" href="${SITE}/"`), 'hreflang x-default')
  need(/<meta name="description" content="[^"]{50,}"/u.test(html), 'description')
  need(html.includes(`<meta property="og:image" content="${SITE}/og.png"`), 'og:image')
  need(html.includes('application/ld+json'), 'JSON-LD')
}
for (const file of ['sitemap.xml', 'robots.txt', 'og.png', 'icon.svg', 'app-icon.png']) if (!existsSync(join(out, file))) problems.push(`${file}: missing`)

if (problems.length) { console.error(`SEO audit failed:\n${problems.join('\n')}`); process.exit(1) }
console.log(`SEO audit passed: ${Object.keys(PAGES).length} locale pages, sitemap, robots, social image`)
