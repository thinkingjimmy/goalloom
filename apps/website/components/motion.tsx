'use client'
/**
 * [INPUT]: Depends on react
 * [OUTPUT]: Exports useSeen and Reveal
 * [POS]: components' motion rules, shared by every animated surface so "when to move" is decided once:
 *        viewport observers bound visibility and progressive entrances; media own their selection/reduced-motion rules.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'

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
