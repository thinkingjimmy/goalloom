/**
 * [INPUT]: Saved item text, lazily cached metadata and localized control labels.
 * [OUTPUT]: Fixed-height cards and a native horizontal carousel with keyboard controls.
 * [POS]: Read-only link previews shared by board, history, archive and saved details.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { messages, useLocale } from '../../i18n'
import { Icon } from '../icons'
import { ExternalLink } from './LinkText'
import { useLinkPreview } from './cache'
import { linkSource, linkUrls } from './parse'

function PreviewCard({ url }: { url: string }) {
  useLocale()
  const { ref, preview } = useLinkPreview(url)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const image = preview?.image && /^data:image\/(?:png|jpeg|webp|gif);base64,/u.test(preview.image) && preview.image !== failedImage ? preview.image : null
  const status = preview?.status ?? 'pending'
  return <ExternalLink ref={ref} className="link-preview" url={url} data-status={status} aria-busy={status === 'pending'}>
    <span className="link-preview-image" aria-hidden="true">
      {image ? <img src={image} alt="" draggable={false} onError={() => setFailedImage(image)} /> : <Icon name="link" size={24} />}
    </span>
    <span className="link-preview-copy">
      <span className="link-preview-source">{preview?.siteName || linkSource(url)}<span className="link-external-mark"><Icon name="forward" size={12} /></span></span>
      <span className="link-preview-title">{preview?.title || linkSource(url)}</span>
      <span className="link-preview-description">{status === 'pending' ? messages.linkLoading : status === 'unavailable' ? messages.linkUnavailable : preview?.description}</span>
    </span>
  </ExternalLink>
}

function PreviewStrip({ urls }: { urls: string[] }) {
  useLocale()
  const track = useRef<HTMLDivElement>(null)
  const target = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [index, setIndex] = useState(0)
  const multiple = urls.length > 1
  const measure = () => {
    const node = track.current
    if (!node) return
    const slides = [...node.querySelectorAll<HTMLElement>('.link-carousel-slide')], first = slides[0]?.offsetLeft ?? 0
    const current = slides.reduce((best, slide, next) => Math.abs(slide.offsetLeft - first - node.scrollLeft) < Math.abs(slides[best]!.offsetLeft - first - node.scrollLeft) ? next : best, 0)
    target.current = current; setIndex(current)
  }
  const step = (direction: number) => {
    const node = track.current
    if (!node) return
    const slides = [...node.querySelectorAll<HTMLElement>('.link-carousel-slide')]
    target.current = Math.max(0, Math.min(urls.length - 1, target.current + direction))
    node.scrollTo({ left: slides[target.current]!.offsetLeft - slides[0]!.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  useEffect(() => {
    const node = track.current
    if (!node) return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => { observer.disconnect(); if (timer.current) clearTimeout(timer.current) }
  }, [])
  return <section className="link-previews" aria-label={messages.linkPreviews} data-multiple={multiple}
    onPointerDown={event => event.stopPropagation()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (!multiple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
    }}>
    <div className="link-carousel-track" ref={track} tabIndex={multiple ? 0 : undefined} onScroll={() => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(measure, 90)
    }}>
      {urls.map((url, position) => <div className="link-carousel-slide" key={url} role="group" aria-label={messages.linkPosition(position + 1, urls.length)}><PreviewCard url={url} /></div>)}
    </div>
    {multiple && <div className="link-carousel-controls">
      <span className="link-carousel-count tabular" aria-live="polite" aria-atomic="true">{index + 1} / {urls.length}</span>
      <button type="button" className="link-carousel-previous" aria-label={messages.linkPrevious} disabled={index === 0} onClick={() => step(-1)}><Icon name="previous" size={14} /></button>
      <button type="button" className="link-carousel-next" aria-label={messages.linkNext} disabled={index === urls.length - 1} onClick={() => step(1)}><Icon name="next" size={14} /></button>
    </div>}
  </section>
}

export const LinkPreviews = memo(function LinkPreviews({ text }: { text: string }) {
  const urls = useMemo(() => linkUrls(text), [text])
  return urls.length ? <PreviewStrip key={urls.join('\n')} urls={urls} /> : null
})
