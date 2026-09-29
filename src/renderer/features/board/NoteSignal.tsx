/**
 * [INPUT]: A row's bounded note signal and item identity; the full description loads through getItem only while the peek is open.
 * [OUTPUT]: One-line signal under the title (checklist progress with the first open item, or the first line; first link host +N).
 *           Hovering it for 300ms or focusing it opens a read-only floating peek with the Markdown note and its link cards;
 *           leaving both, Escape or an outside press closes it. Pressing the signal never starts a drag or opens the detail.
 * [POS]: Board row decoration for task descriptions (D5 "signal + peek"); editing and saving stay in ItemDetail.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { NoteSignal as Signal } from '../../../shared/contracts/entities'
import { messages, useLocale } from '../../i18n'
import { desktopApi } from '../../state/use-workspace'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { DescriptionEditor } from '../../components/description/DescriptionEditor'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkSource, linkUrls } from '../../components/links/parse'
import './note-signal.css'

const openDelay = 300, closeDelay = 150
const ignore = () => {}

export function NoteSignal({ itemId, title, note }: { itemId: string; title: string; note: Signal }) {
  useLocale()
  const [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null)
  const timer = useRef(0), armed = useRef(false), panel = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null)
  // Virtual rows can remount under a resting pointer; a signal that mounts already hovered keeps its pending open.
  useEffect(() => { if (trigger.current?.matches(':hover')) later(true, openDelay); return () => clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!open) return
    let active = true
    void desktopApi().getItem(itemId).then(detail => { if (active) setText(detail.item.description) }).catch(() => { if (active) setText('') })
    // Hover-opened peeks never hold focus, so Escape is taken at the window before other handlers see it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault(); event.stopPropagation(); setOpen(false)
    }
    window.addEventListener('keydown', escape, true)
    return () => { active = false; window.removeEventListener('keydown', escape, true) }
  }, [open, itemId])
  const later = (next: boolean, delay: number) => { clearTimeout(timer.current); armed.current = next; timer.current = window.setTimeout(() => { armed.current = false; setOpen(next) }, delay) }
  const hold = () => { clearTimeout(timer.current); armed.current = false }
  const saved = useMemo(() => new Set(linkUrls(text ?? '')), [text])
  const tasks = note.tasks, words = tasks ? note.next : note.excerpt
  const host = note.links[0] ? linkSource(note.links[0]) : null
  const summary = [tasks && `${tasks.done}/${tasks.total}`, host && (note.linkCount > 1 ? `${host} +${note.linkCount - 1}` : host), words].filter(Boolean).join(' · ')
  return <Popover floating open={open} onClose={() => setOpen(false)} className="note-peek" anchor={
    <button type="button" ref={trigger} className="note-signal" aria-label={messages.labelled(messages.description, summary)} aria-expanded={open} aria-haspopup="dialog"
      onPointerDown={event => event.stopPropagation()} onPointerEnter={() => later(true, openDelay)} onPointerMove={() => { if (!open && !armed.current) later(true, openDelay) }} onPointerLeave={() => later(false, closeDelay)}
      onFocus={() => { hold(); setOpen(true) }} onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node | null)) later(false, closeDelay) }}
      onClick={() => { hold(); setOpen(!open) }}>
      {tasks && <span className="note-progress"><span className="note-bar" style={{ '--done': tasks.done / tasks.total } as CSSProperties} />{tasks.done}/{tasks.total}</span>}
      {host && <span className="note-link"><Icon name="link" size={12} strokeWidth={1.8} />{host}{note.linkCount > 1 && <span className="note-more">+{note.linkCount - 1}</span>}</span>}
      {words && <span className="note-words">{!tasks && !host && <Icon name="note" size={12} strokeWidth={1.8} />}<span>{words}</span></span>}
    </button>
  }>
    <section ref={panel} className="note-peek-panel" role="dialog" aria-label={messages.labelled(messages.description, title)}
      onPointerEnter={hold} onPointerLeave={() => later(false, closeDelay)} onPointerDown={event => event.stopPropagation()}>
      <h4 className="note-peek-title"><Icon name="note" size={12} strokeWidth={1.8} />{messages.description}</h4>
      {text === null ? <p className="note-peek-loading" aria-busy="true">…</p> : <>
        <DescriptionEditor key={text} id={`note-peek-${itemId}`} value={text} savedUrls={saved} onChange={ignore} readOnly />
        <LinkPreviews text={text} />
      </>}
    </section>
  </Popover>
}
