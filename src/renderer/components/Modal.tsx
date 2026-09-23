import { messages } from '../lib/messages'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Icon } from './icons'

export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={wide ? 'modal modal-wide' : 'modal'} aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
    <header><h2>{title}</h2><Button variant="ghost" size="icon" aria-label={messages.close} onClick={close}><Icon name="close" /></Button></header>
    {children}
  </dialog>
}
