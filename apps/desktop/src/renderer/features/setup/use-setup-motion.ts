/**
 * [INPUT]: Ordered first-run pages, input modality, document visibility and reduced-motion preference.
 * [OUTPUT]: Explicit welcome arrivals, reversible camera, directional form transitions and cancellation on hide/unmount.
 * [POS]: Setup-only motion; keyboard and reduced-motion navigation commit immediately, without new dependencies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export type EntryMotion = 'forward' | 'backward' | null
/** Only explicit welcome/setup navigation animates entry; first load remains still. */
export function useEntryMotion(root: RefObject<HTMLDivElement | null>, direction: EntryMotion) {
  useLayoutEffect(() => {
    if (!direction || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animations = [...(root.current?.querySelectorAll<HTMLElement>('[data-entry-part]') ?? [])].map(element => {
      const form = element.dataset.entryPart === 'form'
      return element.animate(form
        ? [{ opacity: 0, transform: `translateX(${direction === 'forward' ? 14 : -14}px)` }, { opacity: 1, transform: 'translateX(0)' }]
        : [{ opacity: 0 }, { opacity: 1 }], { duration: form ? 220 : 280, delay: form ? 0 : 30, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'backwards' })
    })
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const cancel = () => { if (document.hidden || reduced.matches) animations.forEach(animation => animation.cancel()) }
    document.addEventListener('visibilitychange', cancel)
    reduced.addEventListener('change', cancel)
    return () => { animations.forEach(animation => animation.cancel()); document.removeEventListener('visibilitychange', cancel); reduced.removeEventListener('change', cancel) }
  }, [root, direction])
}

export function useSetupMotion<Step extends string>(step: Step, change: (step: Step) => void, order: readonly string[] = ['calendar', 'direction']) {
  const root = useRef<HTMLDivElement>(null), form = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null)
  const active = useRef<Animation | null>(null)
  const pending = useRef<(() => void) | null>(null)
  const enter = useRef(0)
  const previous = useRef(step)
  const navigate = (next: Step, keyboard: boolean) => {
    active.current?.cancel()
    pending.current = null
    const animate = !keyboard && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches
    if (root.current) root.current.dataset.motion = animate ? 'animated' : 'instant'
    if (!animate || !form.current) { enter.current = 0; change(next); return }
    const direction = order.indexOf(next) > order.indexOf(step) ? 1 : -1
    const commit = () => { pending.current = null; enter.current = direction; change(next) }
    pending.current = commit
    const animation = form.current.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-direction * 8}px)` }], { duration: 100, easing: 'ease-in', fill: 'forwards' })
    active.current = animation
    animation.onfinish = commit
  }
  useLayoutEffect(() => {
    active.current?.cancel()
    const direction = enter.current
    enter.current = 0
    if (direction && form.current) active.current = form.current.animate([{ opacity: 0, transform: `translateX(${direction * 14}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 220, delay: 30, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'backwards' })
    // Browser autofocus has no scroll target when returning to the non-input calendar form.
    if (step === 'calendar' && previous.current !== step) form.current?.querySelector<HTMLButtonElement>('#setup-calendar-mode')?.focus({ preventScroll: true })
    previous.current = step
  }, [step])
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const finish = () => {
      if (!document.hidden && !reduced.matches) return
      active.current?.cancel()
      world.current?.getAnimations().forEach(animation => animation.finish())
      if (root.current) root.current.dataset.motion = 'instant'
      const commit = pending.current
      pending.current = null
      commit?.()
      enter.current = 0
    }
    document.addEventListener('visibilitychange', finish)
    reduced.addEventListener('change', finish)
    return () => { active.current?.cancel(); pending.current = null; document.removeEventListener('visibilitychange', finish); reduced.removeEventListener('change', finish) }
  }, [])
  return { root, form, world, navigate }
}
