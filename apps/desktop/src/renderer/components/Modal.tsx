/**
 * [INPUT]: Accessible title, optional header content/actions, close callback and size.
 * [OUTPUT]: Native dialog focus containment, dialog-scoped Escape, shared header and close control.
 * [POS]: Shared dialog shell for details, settings, search and backlog views.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { IconButton } from './ui/button'
import { messages } from '../i18n'
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './icons'

export function Modal({ title, heading, actions, children, close, wide = false, className = '' }: { title: string; heading?: ReactNode; actions?: ReactNode; children: ReactNode; close: () => void; wide?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); event.stopPropagation(); close() }}
    onMouseDown={event => { if (event.target === dialog.current) close() }}>
    <header className="modal-header">{heading ?? <h2>{title}</h2>}{actions}<IconButton aria-label={messages.close} onClick={close}><Icon name="close" size={18} /></IconButton></header>
    {children}
  </dialog>
}
