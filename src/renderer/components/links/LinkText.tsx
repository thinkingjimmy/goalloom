/**
 * [INPUT]: Saved text, the display parser, localized copy and external-browser IPC.
 * [OUTPUT]: Safe inline links and a detail-opening title with sibling link controls.
 * [POS]: Shared text rendering for current, historical and archived item surfaces.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { forwardRef, memo, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { messages, useLocale } from '../../i18n'
import { desktopApi } from '../../state/use-workspace'
import { Icon } from '../icons'
import { linkSource, parseLinks } from './parse'
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

export const LinkText = memo(function LinkText({ text }: { text: string }) {
  const tokens = useMemo(() => parseLinks(text), [text])
  return <>{tokens.map((token, index) => 'text' in token ? token.text : <ExternalLink key={index} className={`link-inline${token.named ? '' : ' link-domain'}`} url={token.url}>
    {token.named ? token.label : <span className="link-domain-label">{linkSource(token.url)}</span>}{!token.named && <span className="link-external-mark"><Icon name="forward" size={12} /></span>}
  </ExternalLink>)}</>
})

export function LinkTitle({ text, onOpen, className = '' }: { text: string; onOpen: () => void; className?: string }) {
  return <div className={`link-title ${className}`}>
    <button type="button" className="task-title link-title-open" title={text} aria-label={text} onClick={onOpen} />
    <span className="link-rich-text"><LinkText text={text} /></span>
  </div>
}
