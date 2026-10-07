/**
 * [INPUT]: Bounded note/guidance signals; full approved content loads only while a read-only peek opens.
 * [OUTPUT]: One board signal with checklist/description priority and a secondary guidance view.
 * [POS]: Board decoration sharing the existing peek, without body transfer or task writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { NoteSignal as Signal, ItemSummary } from '../../../shared/contracts/entities'
import { assistanceMessages } from '../../i18n/assistance'
import type { GuidanceValue } from '../../../shared/contracts/assistance'
import { messages, useLocale } from '../../i18n'
import { desktopApi } from '../../state/use-workspace'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkSource, linkUrls } from '../../components/links/parse'
import '../../components/description/description.css'
import './note-signal.css'

const DescriptionEditor = lazy(() => import('../../components/description/DescriptionEditor').then(module => ({ default: module.DescriptionEditor })))

const openDelay = 300, closeDelay = 150
const ignore = () => {}

export function NoteSignal({ itemId, title, note, guidance }: { itemId: string; title: string; note: Signal | null; guidance?: ItemSummary['guidance'] }) {
  useLocale()
  const t = assistanceMessages()
  const [savedGuidance, setSavedGuidance] = useState<GuidanceValue | null>(null)
  const [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null)
  const timer = useRef(0), armed = useRef(false), panel = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null)
  // Virtual rows can remount under a resting pointer; a signal that mounts already hovered keeps its pending open.
  useEffect(() => { if (trigger.current?.matches(':hover')) later(true, openDelay); return () => clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!open) return
    let active = true
    void desktopApi().getItem(itemId).then(detail => { if (active) { setText(detail.item.description); setSavedGuidance(detail.guidance?.value ?? null) } }).catch(() => { if (active) setText('') })
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
  const tasks = note?.tasks, words = tasks ? note?.next : note?.excerpt || guidance?.nextAction
  const host = note?.links[0] ? linkSource(note.links[0]) : null
  const summary = [tasks && `${tasks.done}/${tasks.total}`, host && (note!.linkCount > 1 ? `${host} +${note!.linkCount - 1}` : host), words].filter(Boolean).join(' · ')
  return <Popover floating open={open} onClose={() => setOpen(false)} className="note-peek" anchor={
    <button type="button" ref={trigger} className="note-signal" aria-label={messages.labelled(note ? messages.description : t.guidance, summary)} aria-expanded={open} aria-haspopup="dialog"
      onPointerDown={event => event.stopPropagation()} onPointerEnter={() => later(true, openDelay)} onPointerMove={() => { if (!open && !armed.current) later(true, openDelay) }} onPointerLeave={() => later(false, closeDelay)}
      onFocus={() => { hold(); setOpen(true) }} onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node | null)) later(false, closeDelay) }}
      onClick={() => { hold(); setOpen(!open) }}>
      {tasks && <span className="note-progress"><span className="note-bar" style={{ '--done': tasks.done / tasks.total } as CSSProperties} />{tasks.done}/{tasks.total}</span>}
      {host && <span className="note-link"><Icon name="link" size={12} strokeWidth={1.8} />{host}{note!.linkCount > 1 && <span className="note-more">+{note!.linkCount - 1}</span>}</span>}
      {words && <span className="note-words">{!tasks && !host && <Icon name="note" size={12} strokeWidth={1.8} />}<span>{words}</span></span>}
    </button>
  }>
    <section ref={panel} className="note-peek-panel" role="dialog" aria-label={messages.labelled(note ? messages.description : t.guidance, title)}
      onPointerEnter={hold} onPointerLeave={() => later(false, closeDelay)} onPointerDown={event => event.stopPropagation()}>
      <h4 className="note-peek-title"><Icon name="note" size={12} strokeWidth={1.8} />{note ? messages.description : t.guidance}</h4>
      {text === null ? <p className="note-peek-loading" aria-busy="true">…</p> : <Suspense fallback={<p className="note-peek-loading" aria-busy="true">…</p>}>
        {savedGuidance && <details className="note-peek-guidance" open={!note}><summary>{t.guidance}</summary><p>{savedGuidance.nextAction}</p>{savedGuidance.contextNote && <p>{savedGuidance.contextNote}</p>}{savedGuidance.scopeNote && <p>{savedGuidance.scopeNote}</p>}</details>}
        {(note || text.trim()) && <DescriptionEditor key={text} id={`note-peek-${itemId}`} value={text} savedUrls={saved} onChange={ignore} readOnly />}
        <LinkPreviews text={text} />
      </Suspense>}
    </section>
  </Popover>
}
