'use client'
/**
 * [INPUT]: Server-rendered Hero content and the explicit home content frame, browser scroll, viewport and motion preferences.
 * [OUTPUT]: HeroFrame, a wide first-paint frame that settles to the shared reading-frame width.
 * [POS]: Home presentation boundary; owns frame alignment and proportional preview presentation, never demo state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function HeroFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let viewport = 0
    let targetLeft = 16
    let targetRight = 16
    let previewWidth = 0
    let previewInset = 32
    let previewMax = 1232
    let border = 2
    const clearPreview = () => {
      node.style.removeProperty('--hero-product-width')
      node.style.removeProperty('--hero-product-scale')
    }
    const update = () => {
      frame = 0
      if (viewport <= 900) {
        node.style.removeProperty('--hero-inset')
        node.style.removeProperty('--hero-right')
        clearPreview()
        return
      }
      const progress = motion.matches ? 1 : Math.min(1, Math.max(0, scrollY / 360))
      const eased = progress * progress * (3 - 2 * progress)
      const left = 16 + (targetLeft - 16) * eased
      const right = 16 + (targetRight - 16) * eased
      node.style.setProperty('--hero-inset', `${left}px`)
      node.style.setProperty('--hero-right', `${right}px`)
      if (motion.matches) { clearPreview(); return }
      const available = Math.min(previewMax, viewport - left - right - border - previewInset * 2)
      node.style.setProperty('--hero-product-width', `${previewWidth}px`)
      node.style.setProperty('--hero-product-scale', `${Math.min(1, available / previewWidth)}`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const measure = () => {
      viewport = document.documentElement.clientWidth
      const content = document.getElementById('home-content')?.getBoundingClientRect()
      targetLeft = content?.left ?? 16
      targetRight = content ? viewport - content.right : 16
      const style = getComputedStyle(node)
      previewInset = parseFloat(style.getPropertyValue('--hero-preview-inset'))
      previewMax = parseFloat(style.getPropertyValue('--hero-preview-max'))
      border = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      previewWidth = Math.min(previewMax, viewport - 32 - border - previewInset * 2)
      schedule()
    }
    const observer = new ResizeObserver(measure)
    const content = document.getElementById('home-content')
    if (content) observer.observe(content)
    measure()
    addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', measure)
    motion.addEventListener('change', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      removeEventListener('scroll', schedule)
      removeEventListener('resize', measure)
      motion.removeEventListener('change', schedule)
    }
  }, [])
  return <section ref={ref} className="hero-shell" aria-labelledby="hero-title">{children}</section>
}
