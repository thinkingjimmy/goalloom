/**
 * [INPUT]: Original localized maker note, author avatar and native product-video copy.
 * [OUTPUT]: ProductTour with a top-aligned maker note and quiet-screening video matching pricing/FAQ columns.
 * [POS]: Homepage introduction after Hero; keeps the shared section edges without scene buttons.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SiteCatalog } from '@/lib/i18n'
import { Reveal } from '../motion'
import { VideoIntro } from './video-intro'

export function ProductTour({ intro, note }: { intro: SiteCatalog['intro']; note: SiteCatalog['note'] }) {
  return <Reveal className="section video-intro product-tour" id="intro" aria-labelledby="intro-title">
    <div className="intro-copy">
      <h2 className="eyebrow" id="intro-title">{note.eyebrow}</h2>
      <p className="intro-quote">{note.before + note.em1 + note.middle + note.em2 + note.after}</p>
      <a className="intro-author" href={note.authorUrl} target="_blank" rel="me noopener noreferrer">
        <img src="/avatar.jpg" alt="" width={40} height={40} />{note.author}
      </a>
    </div>
    <div className="intro-content"><VideoIntro copy={intro} /></div>
  </Reveal>
}
