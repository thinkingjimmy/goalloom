/**
 * [INPUT]: Draft/saved title strings, editability and the detail draft callback.
 * [OUTPUT]: Complete rich title display and a growing raw-text editor; metadata never changes the draft.
 * [POS]: ItemDetail's title interaction, sharing the board's links and the detail form's save/leave guards.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/icons'
import { LinkText } from '../../components/links/LinkText'
import { linkUrls } from '../../components/links/parse'
import { messages } from '../../i18n'

export function DetailTitle({ value, savedValue, onChange, readOnly }: { value: string; savedValue: string; onChange: (value: string) => void; readOnly: boolean }) {
  const [editing, setEditing] = useState(false)
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null)
  const restoreFocus = useRef(false)
  const pointerDown = useRef(false), pendingBlur = useRef(false)
  const savedUrls = useMemo(() => new Set(linkUrls(savedValue)), [savedValue])
  useEffect(() => {
    if (!editing) return
    let frame = 0
    const begin = () => { pointerDown.current = true }
    const end = () => {
      pointerDown.current = false
      if (!pendingBlur.current) return
      // A title's resolved height can differ from its source. Finish the pointer
      // click before changing layout, so Save/Discard cannot move under the pointer.
      frame = requestAnimationFrame(() => {
        pendingBlur.current = false
        if (document.activeElement !== input.current) setEditing(false)
      })
    }
    document.addEventListener('pointerdown', begin, true)
    document.addEventListener('pointerup', end, true)
    document.addEventListener('pointercancel', end, true)
    return () => {
      cancelAnimationFrame(frame); pointerDown.current = false; pendingBlur.current = false
      document.removeEventListener('pointerdown', begin, true)
      document.removeEventListener('pointerup', end, true)
      document.removeEventListener('pointercancel', end, true)
    }
  }, [editing])
  useLayoutEffect(() => {
    if (readOnly) { setEditing(false); return }
    if (editing) {
      input.current?.focus()
      const length = input.current?.value.length ?? 0
      input.current?.setSelectionRange(length, length)
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      root.current?.querySelector<HTMLButtonElement>('.detail-title-edit')?.focus()
    }
  }, [editing, readOnly])

  return <div className="title-line" ref={root}>
    {editing && !readOnly ? <textarea ref={input} className="title-input" aria-label={messages.title} value={value} rows={1} maxLength={500} required
      onChange={event => onChange(event.target.value)} onBlur={() => { if (pointerDown.current) pendingBlur.current = true; else setEditing(false) }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation()
          restoreFocus.current = true; setEditing(false)
        } else if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
          restoreFocus.current = true; setEditing(false)
        }
      }} /> : <>
      <h2 className="detail-title-display" data-editable={!readOnly} onClick={() => { if (!readOnly) setEditing(true) }}>
        <span className="link-rich-text"><LinkText text={value || messages.titlePlaceholder} savedUrls={savedUrls} /></span>
      </h2>
      {!readOnly && <button type="button" className="detail-title-edit" aria-label={messages.editTitle} title={messages.editTitle} onClick={() => setEditing(true)}><Icon name="edit" size={14} /></button>}
    </>}
  </div>
}
