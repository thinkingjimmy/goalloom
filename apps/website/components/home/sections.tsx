/**
 * [INPUT]: Localized copy, shared navigation/downloads/icons, HeroFrame and the playable HeroDemo.
 * [OUTPUT]: Exports Hero with visible introduction and DownloadSection with the shared platform action.
 * [POS]: Hero composition with a local board-copy adapter; ProductTour owns the maker/video section.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale, SiteCatalog } from '@/lib/i18n'
import { SiteHeader } from '../site-header'
import { Mark } from '../icons'
import { DownloadButton } from '../download-button'
import { HeroDemo } from './hero-demo'
import { HeroFrame } from './hero-frame'

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
    <HeroFrame>
      {/* Decorative wallpaper; both themes stay in the DOM and opacity selects the visible one. */}
      <img className="wall" src="/hero-light.jpg" alt="" fetchPriority="high" />
      <img className="wall wall-dark" src="/hero-dark.jpg" alt="" loading="lazy" />
      <div className="hero-intro">
        <span className="hero-app-icon" aria-hidden="true"><Mark size={36} /></span>
        <h1 id="hero-title">{t.hero.h1}</h1>
        <p>{t.hero.lead}</p>
        <DownloadAction t={t} />
      </div>
      <div className="stage-frame">
        <HeroDemo copy={{
          ...boardCopy(t), all: t.demo.all, onlyFlow: t.demo.onlyFlow, flows: t.demo.flows, search: t.demo.search,
          columns: t.demo.columns, settings: t.demo.settings, newItem: t.demo.newItem, composer: t.demo.composer,
          sentence: t.demo.sentence, createTo: t.demo.createTo, created: t.demo.created, undone: t.demo.undone,
          undo: t.demo.undo, dismiss: t.demo.dismiss, scenes: t.hero.scenes,
          sceneJev: t.hero.sceneJev, sceneLines: t.hero.sceneLines,
          sync: t.hero.sync,
        }} />
      </div>
    </HeroFrame>
  </>
}

function DownloadAction({ t }: { t: SiteCatalog }) {
  return <div className="home-download-action">
    <DownloadButton copy={t.download} compactLabel={t.nav.download} />
    <p className="home-download-detail"><span>{t.hero.downloadNote}</span><span data-for="mac">{t.download.mac.detail}</span><span data-for="windows">{t.download.windows.detail}</span></p>
  </div>
}

export function DownloadSection({ t }: { t: SiteCatalog }) {
  return <section className="closing-download" aria-labelledby="closing-title">
    <span className="hero-app-icon" aria-hidden="true"><Mark size={36} /></span>
    <h2 id="closing-title">{t.download.title.join(' ')}</h2>
    <p className="closing-lead">{t.hero.closingLead}</p>
    <DownloadAction t={t} />
  </section>
}
