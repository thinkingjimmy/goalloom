/**
 * [INPUT]: Depends on lib/i18n, lib/release, ../icons, ../motion, ../site-header and the client stories/demos
 * [OUTPUT]: Exports Hero, MakerNote, OkrGroup, JevGroup, DownloadFaq and SiteFooter
 * [POS]: components/home's page sections, in page order; copy comes only from the SiteCatalog so all five locales
 *        render the same structure
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale, SiteCatalog } from '@/lib/i18n'
import { RELEASES_URL, REPO, downloadUrl } from '@/lib/release'
import { Icon } from '../icons'
import { Reveal } from '../motion'
import { LanguageMenu, SiteHeader } from '../site-header'
import { CopyLink } from './copy-link'
import { HeroDemo } from './hero-demo'
import { JevDemo } from './jev-demo'
import { LinesStory } from './lines-story'
import { FloatingHeader, Stage } from './stage'

type Props = { locale: Locale; t: SiteCatalog }

const boardCopy = (t: SiteCatalog) => ({
  horizons: t.demo.horizons, meta: t.demo.meta, items: t.demo.items,
  complete: t.demo.complete, reopen: t.demo.reopen, history: t.demo.history, addIn: t.demo.addIn,
})

export function Hero({ locale, t }: Props) {
  return <>
    <FloatingHeader><SiteHeader locale={locale} copy={t.nav} className="float-bar" /></FloatingHeader>
    <Stage header={<SiteHeader locale={locale} copy={t.nav} className="stage-head" />}>
      <section className="stage-frame" aria-labelledby="hero-title">
        <h1 id="hero-title" className="sr-only">{t.hero.h1}</h1>
        {/* Decorative wallpaper; both themes are in the DOM and CSS crossfades them. */}
        <img className="wall" src="/hero-light.jpg" alt="" fetchPriority="high" />
        <img className="wall wall-dark" src="/hero-dark.jpg" alt="" loading="lazy" />
        <div className="menubar" aria-hidden="true">
          <span className="app-name">Goalloom</span>
          {t.hero.menus.map(menu => <span key={menu} className="app-menu">{menu}</span>)}
          <span className="spacer" />
          <span className="clock">{t.hero.clock}</span>
        </div>
        <HeroDemo copy={{
          ...boardCopy(t), all: t.demo.all, onlyFlow: t.demo.onlyFlow, flows: t.demo.flows, search: t.demo.search,
          columns: t.demo.columns, settings: t.demo.settings, newItem: t.demo.newItem, composer: t.demo.composer,
          sentence: t.demo.sentence, createTo: t.demo.createTo, created: t.demo.created, undone: t.demo.undone,
          undo: t.demo.undo, dismiss: t.demo.dismiss, scenes: t.hero.scenes, sceneBoard: t.hero.sceneBoard,
          sceneJev: t.hero.sceneJev, sceneLines: t.hero.sceneLines,
        }} />
      </section>
    </Stage>
  </>
}

export function MakerNote({ t }: Props) {
  return (
    <Reveal className="note" aria-label={t.note.eyebrow}>
      <p className="eyebrow">{t.note.eyebrow}</p>
      <p className="note-quote">{t.note.before}<em>{t.note.em1}</em>{t.note.middle}<em>{t.note.em2}</em>{t.note.after}</p>
      <p className="note-author"><span className="avatar" aria-hidden="true">J</span>{t.note.author}</p>
    </Reveal>
  )
}

export function OkrGroup({ t }: Props) {
  return <>
    <Reveal className="section section-rule group-head" id="board">
      <p className="eyebrow">{t.okr.eyebrow}</p>
      <h2 className="h2 lines-break">{t.okr.title.map(line => <span key={line}>{line}</span>)}</h2>
      <p className="lead">{t.okr.lead}</p>
    </Reveal>
    <Reveal as="div">
      <LinesStory copy={{ ...t.lines, board: boardCopy(t), all: t.demo.all, flows: t.demo.flows }} />
    </Reveal>
  </>
}

export function JevGroup({ t }: Props) {
  return (
    <Reveal className="section-rule" id="jev">
      <div className="section group-head">
        <p className="eyebrow">{t.jev.eyebrow}</p>
        <h2 className="h2 lines-break">{t.jev.title.map(line => <span key={line}>{line}</span>)}</h2>
        <p className="lead">{t.jev.lead}</p>
      </div>
      <div className="section story story-figure-first">
        <figure className="fig fig-jev">
          <JevDemo copy={{
            label: t.jev.demoLabel, typed: t.jev.typed, board: boardCopy(t), all: t.demo.all, composer: t.demo.composer,
            sentence: t.demo.sentence, createTo: t.demo.createTo, created: t.demo.created, undo: t.demo.undo,
          }} />
        </figure>
        <div>
          <p className="eyebrow">{t.jev.subEyebrow}</p>
          <h3 className="h3 lines-break">{t.jev.subTitle.map(line => <span key={line}>{line}</span>)}</h3>
          <p className="body">{t.jev.body}</p>
          <div className="subs">
            {t.jev.cards.map(card => <div key={card.title} className="sub"><div className="sub-t">{card.title}</div><div className="sub-d">{card.desc}</div></div>)}
          </div>
        </div>
      </div>
    </Reveal>
  )
}

export function DownloadFaq({ t }: Props) {
  const d = t.download
  return (
    <Reveal className="section section-rule download" id="download">
      <div>
        <p className="eyebrow">{d.eyebrow}</p>
        <h2 className="dl-title lines-break">{d.title.map(line => <span key={line}>{line}</span>)}</h2>
        <p className="dl-lead">{d.lead}</p>
        <div className="dl-actions">
          {(['mac', 'windows'] as const).map(platform => {
            const other = platform === 'mac' ? 'windows' : 'mac'
            return (
              <div key={platform} data-for={platform} className="dl-actions">
                <a className="dl-main" href={downloadUrl(platform)}>
                  <Icon name={platform === 'mac' ? 'apple' : 'windows'} size={20} />
                  <span className="dl-main-text"><strong>{d[platform].action}</strong><small>{d[platform].detail}</small></span>
                  <Icon name="download" size={18} />
                </a>
                <p className="dl-other">{d.also}<a href={downloadUrl(other)}><Icon name={other === 'mac' ? 'apple' : 'windows'} size={12} />{d[other].detail}</a></p>
              </div>
            )
          })}
          <CopyLink href={RELEASES_URL} label={d.phone} done={d.copied} />
        </div>
        <p className="dl-ask">{d.ask} <a href={`${REPO}/issues`}>{d.askLink}</a></p>
      </div>
      <div className="faq">
        <h3 className="sr-only">{t.faq.title}</h3>
        {t.faq.items.map((item, index) => (
          <details key={item.q} open={index === 0}>
            <summary>{item.q}<Icon name="expand" size={16} /></summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </Reveal>
  )
}

export function SiteFooter({ locale, t }: Props) {
  return (
    <footer className="site-footer">
      <span>{t.footer.rights}</span>
      <nav aria-label={t.footer.links}>
        <a href={RELEASES_URL}>{t.nav.releases}</a>
        <a href={REPO}>{t.nav.github}</a>
        <a href={`${REPO}/issues`}>{t.footer.feedback}</a>
        <LanguageMenu locale={locale} label={t.nav.language} className="lang-button" up />
      </nav>
    </footer>
  )
}
