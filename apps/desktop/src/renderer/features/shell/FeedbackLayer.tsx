/**
 * [INPUT]: Feedback content and the current native modal dialog stack.
 * [OUTPUT]: A nonmodal top-layer portal with interactive feedback and measured page/modal clearance.
 * [POS]: Shell presentation boundary; Sonner owns feedback timers and motion, while App retains actions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FeedbackStack, FeedbackStackProvider } from './FeedbackStack'

interface FeedbackLayerProps { children: ReactNode }

function activeHost(): HTMLElement {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog:modal')].at(-1) ?? document.body
}

export function FeedbackLayer({ children }: FeedbackLayerProps) {
  const stackId = useId()
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

  useLayoutEffect(() => {
    const node = layer.current
    if (!node) return
    const resize = new ResizeObserver(syncClearance)
    function syncClearance() {
      const children = [...(node?.querySelectorAll('.feedback-stack') ?? [])]
      const visible = children.map(child => child.getBoundingClientRect()).filter(box => box.height > 0)
      const top = Math.min(innerHeight, ...visible.map(box => box.top))
      // Keep screen and dialog controls above persistent feedback without hiding its recovery actions.
      host.style.setProperty('--feedback-clearance', `${Math.ceil(innerHeight - top + (visible.length ? 16 : 0))}px`)
      for (const child of children) resize.observe(child)
    }
    host.setAttribute('data-feedback-host', '')
    const mutation = new MutationObserver(syncClearance)
    mutation.observe(node, { childList: true, subtree: true })
    addEventListener('resize', syncClearance)
    syncClearance()
    return () => {
      resize.disconnect()
      mutation.disconnect()
      removeEventListener('resize', syncClearance)
      host.removeAttribute('data-feedback-host')
      host.style.removeProperty('--feedback-clearance')
    }
  }, [host])

  return <FeedbackStackProvider id={stackId}>{createPortal(<div ref={layer} className="feedback-layer" popover="manual"><div className="feedback-layout"><FeedbackStack id={stackId} />{children}</div></div>, host)}</FeedbackStackProvider>
}
