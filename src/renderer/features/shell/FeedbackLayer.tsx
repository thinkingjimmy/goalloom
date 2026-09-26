/**
 * [INPUT]: Feedback content and the current native modal dialog stack.
 * [OUTPUT]: A nonmodal top-layer portal whose controls remain interactive inside the active dialog.
 * [POS]: Shell presentation boundary; App retains feedback state, timers and actions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface FeedbackLayerProps { children: ReactNode }

function activeHost(): HTMLElement {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog:modal')].at(-1) ?? document.body
}

export function FeedbackLayer({ children }: FeedbackLayerProps) {
  const [host, setHost] = useState(activeHost)
  const currentHost = useRef(host), layer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const syncHost = () => {
      const next = activeHost()
      if (next === currentHost.current) return
      currentHost.current = next
      setHost(next)
    }
    const observer = new MutationObserver(syncHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    // Modal.showModal() may run after this layout effect, so keep observing its open attribute.
    syncHost()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const node = layer.current
    if (!node) return
    try { node.showPopover() }
    catch {
      // A display failure must not hide saved-result feedback or its recovery actions.
      node.removeAttribute('popover')
    }
    return () => {
      try { if (node.matches(':popover-open')) node.hidePopover() } catch { /* The host may already be detached. */ }
    }
  }, [host])

  return createPortal(<div ref={layer} className="feedback-layer" popover="manual">{children}</div>, host)
}
