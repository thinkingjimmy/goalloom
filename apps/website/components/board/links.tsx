/**
 * [INPUT]: Saved demo link IDs, localized preview copy and the public site/repository identities.
 * [OUTPUT]: DemoLinkTitle, DemoLinkPreview and LinkPreviewCopy; ordinary external anchors with local artwork.
 * [POS]: Board-only rendering of the product's saved URL treatment; never requests remote metadata or favicons.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { REPO } from '@/lib/release'
import { SITE_URL } from '@/lib/seo/site'
import type { DemoItem } from '@/lib/board'
import { Icon } from '../icons'

type LinkId = NonNullable<DemoItem['link']>
export type LinkPreviewCopy = Record<LinkId, { title: string; description: string }>

const LINKS = {
  site: { url: SITE_URL, source: 'goalloom.com', image: '/og.png', favicon: '/app-icon.png' },
  repo: { url: REPO, source: 'github.com', image: '/app-icon.png', favicon: null },
} as const

export function DemoLinkTitle({ id, copy }: { id: LinkId; copy: LinkPreviewCopy }) {
  const link = LINKS[id]
  return <a className="demo-link-inline" href={link.url} target="_blank" rel="noopener noreferrer">
    <span className="demo-link-favicon" aria-hidden="true">
      {link.favicon ? <img src={link.favicon} alt="" width={14} height={14} /> : <Icon name="link" size={14} />}
    </span>
    {copy[id].title}
  </a>
}

export function DemoLinkPreview({ id, copy }: { id: LinkId; copy: LinkPreviewCopy }) {
  const link = LINKS[id]
  return <div className="demo-link-previews">
    <a className="demo-link-preview" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={copy[id].title}>
      <span className="demo-link-preview-copy">
        <span className="demo-link-preview-source">{link.source}<Icon name="external" size={12} /></span>
        <span className="demo-link-preview-title">{copy[id].title}</span>
        <span className="demo-link-preview-description">{copy[id].description}</span>
      </span>
      <span className="demo-link-preview-image"><img src={link.image} alt="" width={88} height={128} loading="lazy" /></span>
    </a>
  </div>
}
