/**
 * [INPUT]: Selected period identity, workspace generation, data readiness and explicit pointer navigation requests.
 * [OUTPUT]: One cancellable 220ms directional content entrance, with reduced-motion/visibility cleanup and synchronized board overlays.
 * [POS]: Board-column motion boundary; preserves mounted controls, drafts and the scroll container.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { beginBoardMotion, boardMotionEvent } from './RowMotion'

export function usePeriodMotion(root: RefObject<HTMLElement | null>, generation: string, periodId: string | undefined, loading: boolean) {
  const pending = useRef<{ key: string; direction: number } | null>(null)
  const running = useRef<(() => void) | null>(null)
  const key = `${generation}:${periodId}`
  const stop = useCallback(() => { running.current?.(); running.current = null }, [])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const cancel = () => { if (media.matches || document.hidden) { pending.current = null; stop() } }
    media.addEventListener('change', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => { stop(); media.removeEventListener('change', cancel); document.removeEventListener('visibilitychange', cancel) }
  }, [stop])

  useLayoutEffect(() => {
    stop()
    const request = pending.current
    if (!request || request.key !== key) { pending.current = null; return }
    if (loading) return
    pending.current = null
    const body = root.current?.querySelector<HTMLElement>('.period-body'), board = root.current?.closest('.board')
    if (!body || !board || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    body.style.willChange = 'transform, opacity'
    const animation = body.animate([
      { transform: `translateX(${request.direction * 28}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    animation.id = 'period-navigation'
    const release = beginBoardMotion(board)
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      animation.cancel()
      body.style.willChange = ''
      release()
      if (running.current === cleanup) running.current = null
    }
    running.current = cleanup
    void animation.finished.then(cleanup, cleanup)
    board.dispatchEvent(new Event(boardMotionEvent))
    return stop
  }, [key, loading, root, stop])

  return (targetId: string, direction: number, animate: boolean) => {
    stop()
    pending.current = animate ? { key: `${generation}:${targetId}`, direction } : null
  }
}
