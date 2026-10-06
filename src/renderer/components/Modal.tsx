/**
 * [INPUT]: Accessible title, optional header content/actions, close callback and size.
 * [OUTPUT]: Modal: native dialog focus containment, Escape handling, shared header and close control.
 * [POS]: Shared dialog shell for details, settings, search and backlog views.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages } from '../i18n'
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './icons'

export function Modal({ title, heading, actions, children, close, wide = false, className = '' }: { title: string; heading?: ReactNode; actions?: ReactNode; children: ReactNode; close: () => void; wide?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close() }}
    onMouseDown={event => { if (event.target === dialog.current) close() }}>
    <header className="modal-header">{heading ?? <h2>{title}</h2>}{actions}<button className="icon-button" aria-label={messages.close} onClick={close}><Icon name="close" size={18} /></button></header>
    {children}
  </dialog>
}
