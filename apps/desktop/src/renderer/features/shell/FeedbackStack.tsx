/**
 * [INPUT]: Generation-scoped feedback declarations and the active page/dialog feedback layer.
 * [OUTPUT]: Sonner-owned stacking, hover expansion and dismissal with content-sized existing surfaces.
 * [POS]: Shell notification adapter; business owners retain notice conditions, actions and receipt guards.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Toaster, toast } from 'sonner'
import { messages } from '../../i18n'
import 'sonner/dist/styles.css'
import './workspace-notice.css'

const StackContext = createContext<string | null>(null)

export function FeedbackStackProvider({ id, children }: { id: string; children: ReactNode }) {
  return <StackContext.Provider value={id}>{children}</StackContext.Provider>
}

interface FeedbackNotificationProps {
  children: ReactNode
  duration?: number | null
  paused?: boolean
  dismissible?: boolean
  onDismiss?: () => void
}

export function FeedbackNotification({ children, duration = null, paused = false, dismissible = false, onDismiss }: FeedbackNotificationProps) {
  const stackId = useContext(StackContext), localId = useId()
  const [focused, setFocused] = useState(false)
  const id = `${stackId}:${localId}`
  const lifecycle = useRef(0)
  const active = useRef(true)
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss
  useEffect(() => {
    if (!stackId) return
    toast.custom(() => <div className="feedback-content" onFocusCapture={() => setFocused(true)} onBlurCapture={event => setFocused(event.currentTarget.contains(event.relatedTarget))}>{children}</div>, {
      id, toasterId: stackId, duration: paused || focused ? Infinity : duration ?? Infinity, dismissible,
      onDismiss: () => { if (active.current) dismiss.current?.() },
      onAutoClose: () => { if (active.current) dismiss.current?.() },
    })
  }, [stackId, id, children, duration, paused, focused, dismissible])
  useEffect(() => {
    const turn = ++lifecycle.current
    active.current = true
    return () => {
      // StrictMode replays effects synchronously; only a real unmount removes the native toast.
      queueMicrotask(() => {
        if (stackId && lifecycle.current === turn) {
          // Portal transfers and generation cleanup are not user dismissals.
          active.current = false
          toast.dismiss(id)
        }
      })
    }
  }, [stackId, id])
  return stackId ? null : children
}

export function FeedbackStack({ id }: { id: string }) {
  const scroll = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = scroll.current
    if (!node) return
    const observed = new Set<HTMLElement>()
    const sync = () => {
      node.querySelectorAll<HTMLElement>('[data-removed="true"] .feedback-content').forEach(content => { content.inert = true })
      const cards = [...node.querySelectorAll<HTMLElement>('[data-sonner-toast][data-visible="true"]:not([data-removed="true"])')]
      for (const card of observed) if (!cards.includes(card)) { resize.unobserve(card); observed.delete(card) }
      for (const card of cards) if (!observed.has(card)) { resize.observe(card); observed.add(card) }
      const front = cards.find(card => card.dataset.front === 'true')
      if (!front) return
      const width = `${front.offsetWidth}px`
      if (node.style.getPropertyValue('--feedback-front-width') !== width) node.style.setProperty('--feedback-front-width', width)
      const expanded = front.dataset.expanded === 'true'
      for (const card of cards) {
        const content = card.querySelector<HTMLElement>('.feedback-content')
        if (content) content.inert = !expanded && card !== front
      }
      const height = Math.ceil(Math.max(...cards.map(card => expanded
        ? card.offsetHeight + Number.parseFloat(card.style.getPropertyValue('--offset') || '0')
        : front.offsetHeight + Number(card.dataset.index) * 16)))
      const value = `${height}px`
      if (node.style.getPropertyValue('--feedback-stack-height') !== value) node.style.setProperty('--feedback-stack-height', value)
    }
    const resize = new ResizeObserver(sync)
    const mutation = new MutationObserver(sync)
    resize.observe(node)
    mutation.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-front', 'data-expanded', 'data-removed', 'data-visible', 'style'] })
    sync()
    return () => { resize.disconnect(); mutation.disconnect() }
  }, [])
  return <div ref={scroll} className="workspace-notices feedback-stack">
    <Toaster id={id} position="bottom-center" expand={false} visibleToasts={12} gap={16}
      offset={0} mobileOffset={0} theme="system" containerAriaLabel={messages.notificationRegion}
      toastOptions={{ className: 'feedback-stack-entry' }} />
  </div>
}
