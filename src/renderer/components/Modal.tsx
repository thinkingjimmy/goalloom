/**
 * [INPUT]: 可访问名称、可选页眉内容与页眉操作、关闭回调与尺寸。
 * [OUTPUT]: 原生 dialog 模态框：焦点限制、Esc 关闭、统一页眉与关闭按钮。
 * [POS]: 通用 UI 原语；详情、设置、搜索、往期未完成共用同一弹窗外观。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
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
