/**
 * [INPUT]: Display text, optional saved URL membership, localized copy and external-browser IPC.
 * [OUTPUT]: Shared favicon/page-title links, authored labels and an actionable title with sibling link controls.
 * [POS]: Shared text rendering for current, historical and archived item surfaces.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { forwardRef, memo, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { messages, useLocale } from '../../i18n'
import { desktopApi } from '../../state/use-workspace'
import { Icon } from '../icons'
import { linkSource, parseLinks } from './parse'
import { useLinkPreview } from './cache'
import './links.css'

export const ExternalLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { url: string }>(function ExternalLink({ url, children, onClick, onAuxClick, ...props }, ref) {
  useLocale()
  const [failed, setFailed] = useState(false)
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); event.stopPropagation()
    setFailed(false)
    void Promise.resolve().then(() => desktopApi().openExternal(url)).then(opened => setFailed(!opened)).catch(() => setFailed(true))
  }
  return <a {...props} ref={ref} href={url} title={failed ? messages.linkOpenFailed : props.title ?? url} draggable={false}
    onPointerDown={event => event.stopPropagation()} onDragStart={event => event.preventDefault()}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) open(event) }}
    onAuxClick={event => { onAuxClick?.(event); if (event.button === 1 && !event.defaultPrevented) open(event) }}>
    {children}{failed && <span className="sr-only" role="alert">{messages.linkOpenFailed}</span>}
  </a>
})

export function InlineLink({ url, label, named = false, enabled = true }: { url: string; label?: string; named?: boolean; enabled?: boolean }) {
  const { ref, preview } = useLinkPreview(url, enabled)
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const icon = preview?.favicon
  return <ExternalLink ref={ref} className={`link-inline${named ? '' : ' link-domain'}`} url={url} data-status={preview?.status ?? 'pending'}>
    <span className="link-favicon" aria-hidden="true">{icon && failedIcon !== icon ? <img src={icon} alt="" width="14" height="14" onError={() => setFailedIcon(icon)} /> : <Icon name="link" size={14} />}</span>
    <span className="link-domain-label">{named ? label : preview?.title || linkSource(url)}</span>
  </ExternalLink>
}

export const LinkText = memo(function LinkText({ text, savedUrls }: { text: string; savedUrls?: ReadonlySet<string> | undefined }) {
  const tokens = useMemo(() => parseLinks(text), [text])
  return <>{tokens.map((token, index) => 'text' in token ? token.text : <InlineLink key={index} url={token.url} label={token.label} named={token.named} enabled={!savedUrls || savedUrls.has(token.url)} />)}</>
})

export function LinkTitle({ text, onOpen, className = '' }: { text: string; onOpen: () => void; className?: string }) {
  return <div className={`link-title ${className}`}>
    <button type="button" className="task-title link-title-open" title={text} aria-label={text} onClick={onOpen} />
    <span className="link-rich-text"><LinkText text={text} /></span>
  </div>
}
