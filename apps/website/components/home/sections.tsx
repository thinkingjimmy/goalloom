/**
 * [INPUT]: Localized copy, shared header/language/theme controls and the playable HeroDemo.
 * [OUTPUT]: Exports Hero with localized board copy.
 * [POS]: Hero composition with a local board-copy adapter; ProductTour owns the maker/video section.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale, SiteCatalog } from '@/lib/i18n'
import { LanguageMenu } from '../language-menu'
import { SiteHeader } from '../site-header'
import { ThemeToggle } from '../theme'
import { HeroDemo } from './hero-demo'

type Props = { locale: Locale; t: SiteCatalog }

const boardCopy = (t: SiteCatalog) => ({
  horizons: t.demo.horizons, meta: t.demo.meta, items: t.demo.items,
  complete: t.demo.complete, reopen: t.demo.reopen, history: t.demo.history, addIn: t.demo.addIn,
  previews: {
    site: { title: t.meta.title, description: t.meta.description },
    repo: { title: 'thinkingjimmy/goalloom', description: t.download.lead },
  },
})

export function Hero({ locale, t }: Props) {
  return <>
    <SiteHeader locale={locale} copy={t.nav} className="site-bar" showPreferences={false} />
    <section className="stage-frame" aria-labelledby="hero-title">
      <h1 id="hero-title" className="sr-only">{t.hero.h1}</h1>
      {/* Decorative wallpaper; both themes stay in the DOM and opacity selects the visible one. */}
      <img className="wall" src="/hero-light.jpg" alt="" fetchPriority="high" />
      <img className="wall wall-dark" src="/hero-dark.jpg" alt="" loading="lazy" />
      <div className="menubar">
        <span className="app-name" aria-hidden="true">Goalloom</span>
        {t.hero.menus.map(menu => <span key={menu} className="app-menu" aria-hidden="true">{menu}</span>)}
        <span className="spacer" aria-hidden="true" />
        <div className="menubar-controls">
          <LanguageMenu locale={locale} label={t.nav.language} className="menubar-control menubar-language" />
          <ThemeToggle toDark={t.nav.themeToDark} toLight={t.nav.themeToLight} className="menubar-control menubar-icon" />
        </div>
        <span className="clock" aria-hidden="true">{t.hero.clock}</span>
      </div>
      <HeroDemo copy={{
        ...boardCopy(t), all: t.demo.all, onlyFlow: t.demo.onlyFlow, flows: t.demo.flows, search: t.demo.search,
        columns: t.demo.columns, settings: t.demo.settings, newItem: t.demo.newItem, composer: t.demo.composer,
        sentence: t.demo.sentence, createTo: t.demo.createTo, created: t.demo.created, undone: t.demo.undone,
        undo: t.demo.undo, dismiss: t.demo.dismiss, scenes: t.hero.scenes,
        sceneJev: t.hero.sceneJev, sceneLines: t.hero.sceneLines,
        sync: t.hero.sync,
      }} />
    </section>
  </>
}
