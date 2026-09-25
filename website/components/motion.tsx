'use client'
/**
 * [INPUT]: Depends on react
 * [OUTPUT]: Exports prefersReducedMotion, useSeen, useCarousel and Reveal
 * [POS]: components' motion rules, shared by every animated surface so "when to move" is decided once:
 *        reduced motion never animates, off-screen surfaces never run, a visitor's pick always wins over autoplay.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** True while the node is at least `threshold` visible. */
export function useSeen<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || !('IntersectionObserver' in window)) { setSeen(true); return }
    const observer = new IntersectionObserver(([entry]) => setSeen(!!entry?.isIntersecting), { threshold })
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])
  return { ref, seen }
}

// One case dwells 5s: long enough to read a figure, short enough not to look stuck (Bottega use-carousel.ts).
const DWELL = 5000

/** Timed selection that only runs while seen, and stops for good once the visitor picks. */
export function useCarousel(count: number, running: boolean) {
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => { if (prefersReducedMotion()) setAuto(false) }, [])
  useEffect(() => {
    if (!auto || !running) return
    const timer = setInterval(() => setActive(at => (at + 1) % count), DWELL)
    return () => clearInterval(timer)
  }, [auto, running, count])
  const pick = (index: number) => { setAuto(false); setActive(index) }
  return { active, auto, pick }
}

/** One-way entrance: hidden by script only while still below the fold, so without JS the section renders whole. */
export function Reveal({ as: Tag = 'section', className, children, ...rest }: { as?: 'section' | 'div'; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'idle' | 'out' | 'in'>('idle')
  useEffect(() => {
    const node = ref.current
    if (!node || !('IntersectionObserver' in window) || node.getBoundingClientRect().top < innerHeight * 0.85) return
    setState('out')
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setState('in')
      observer.disconnect()
    }, { threshold: 0.12 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const classes = ['reveal', className].filter(Boolean).join(' ')
  return <Tag ref={ref as never} className={classes} data-reveal={state === 'out' ? 'out' : 'in'} {...rest}>{children}</Tag>
}
