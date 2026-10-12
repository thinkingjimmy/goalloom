/**
 * [INPUT]: The fresh static export in out/
 * [OUTPUT]: Exit code 0/1 with one line per broken page
 * [POS]: website's build gate (runs after `next build`): every locale page must ship its own canonical, all
 *        reciprocal hreflang alternates, a description, Open Graph image and JSON-LD; sitemap and robots must exist.
 *        Tags are parsed attribute by attribute: hosts such as Vercel rewrite the build and may reorder attributes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const out = resolve(import.meta.dirname, '..', 'out')
const SITE = 'https://www.goalloom.com'
const PAGES = { en: '/', 'zh-CN': '/zh-CN/', ja: '/ja/', es: '/es/', fr: '/fr/' }
const problems = []

/** Every `<name ...>` tag in the document as a lower-cased attribute map. */
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'giu'))].map(([, body]) =>
    Object.fromEntries([...body.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gu)].map(([, key, a, b, c]) => [key.toLowerCase(), a ?? b ?? c])))
}

for (const [locale, path] of Object.entries(PAGES)) {
  const file = join(out, path, 'index.html')
  if (!existsSync(file)) { problems.push(`${path}: missing`); continue }
  const html = readFileSync(file, 'utf8')
  const need = (ok, what) => { if (!ok) problems.push(`${path}: ${what}`) }
  const links = tags(html, 'link'), metas = tags(html, 'meta')
  const meta = key => metas.find(tag => tag.name === key || tag.property === key)?.content
  const alternates = Object.fromEntries(links.filter(tag => tag.rel === 'alternate' && tag.hreflang).map(tag => [tag.hreflang, tag.href]))

  need(tags(html, 'html')[0]?.lang === locale, `html lang (found ${html.match(/<html\b[^>]*>/iu)?.[0] ?? 'no <html>'})`)
  need(links.some(tag => tag.rel === 'canonical' && tag.href === `${SITE}${path}`), 'canonical')
  for (const [other, otherPath] of Object.entries(PAGES)) need(alternates[other] === `${SITE}${otherPath}`, `hreflang ${other}`)
  need(alternates['x-default'] === `${SITE}/`, 'hreflang x-default')
  need((meta('description') ?? '').length >= 50, 'description')
  need(meta('og:image') === `${SITE}/og.png`, 'og:image')
  need(tags(html, 'script').some(tag => tag.type === 'application/ld+json'), 'JSON-LD')
}
for (const file of ['sitemap.xml', 'robots.txt', 'og.png', 'icon.svg', 'app-icon.png']) if (!existsSync(join(out, file))) problems.push(`${file}: missing`)

if (problems.length) { console.error(`SEO audit failed:\n${problems.join('\n')}`); process.exit(1) }
console.log(`SEO audit passed: ${Object.keys(PAGES).length} locale pages, sitemap, robots, social image`)
