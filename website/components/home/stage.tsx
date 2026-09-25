'use client'
/**
 * [INPUT]: Depends on react
 * [OUTPUT]: Exports Stage (the pinned, scroll-shrinking desktop) and FloatingHeader
 * [POS]: components/home's scroll choreography, ported from Bottega hero.tsx / floating-header.tsx. Progress over a
 *        360px runway is smoothstepped into --st/--sx/--sb/--sr/--sp on .stage; the header band fades in only once it
 *        can hold the header, and the floating bar takes over after the pinned desktop leaves — one nav at a time.
 *        Narrow screens skip the shrink (CSS turns the band into a plain bar).
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'

const RUNWAY = 360, MAX_T = 72, MAX_X = 24, MAX_B = 24, MAX_R = 20, HEADER_ROOM = 44
const NARROW = '(max-width: 900px)'

export function Stage({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const pin = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pinNode = pin.current, stageNode = stage.current, bandNode = band.current
    if (!pinNode || !stageNode || !bandNode) return
    const narrow = matchMedia(NARROW)
    let ticket = 0
    const apply = () => {
      ticket = 0
      const style = stageNode.style
      if (narrow.matches) {
        for (const name of ['--st', '--sx', '--sb', '--sr', '--sp', '--spe']) style.removeProperty(name)
        bandNode.inert = false
        return
      }
      const p = Math.min(1, Math.max(0, -pinNode.getBoundingClientRect().top / RUNWAY))
      const e = p * p * (3 - 2 * p)
      const reveal = Math.min(1, Math.max(0, (MAX_T * e - HEADER_ROOM) / 22))
      style.setProperty('--st', `${(MAX_T * e).toFixed(2)}px`)
      style.setProperty('--sx', `${(MAX_X * e).toFixed(2)}px`)
      style.setProperty('--sb', `${(MAX_B * e).toFixed(2)}px`)
      style.setProperty('--sr', `${(MAX_R * e).toFixed(2)}px`)
      style.setProperty('--sp', reveal.toFixed(3))
      style.setProperty('--spe', reveal > 0 ? 'auto' : 'none')
      // Transparent is not absent: an unrevealed band must not take clicks or keyboard focus.
      bandNode.inert = reveal === 0
    }
    const onScroll = () => { if (!ticket) ticket = requestAnimationFrame(apply) }
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    narrow.addEventListener('change', onScroll)
    apply()
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      narrow.removeEventListener('change', onScroll)
      if (ticket) cancelAnimationFrame(ticket)
    }
  }, [])
  return (
    <div ref={pin} className="hero-pin" id="hero-pin">
      <div ref={stage} className="stage">
        <div ref={band} className="stage-band">{header}</div>
        {children}
      </div>
    </div>
  )
}

export function FloatingHeader({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const pinNode = document.getElementById('hero-pin')
    if (!pinNode) return
    let ticket = 0
    const apply = () => { ticket = 0; setShown(pinNode.getBoundingClientRect().bottom <= 60) }
    const onScroll = () => { if (!ticket) ticket = requestAnimationFrame(apply) }
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    apply()
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); if (ticket) cancelAnimationFrame(ticket) }
  }, [])
  return <div className="float-head" data-shown={shown} aria-hidden={!shown} inert={!shown}>{children}</div>
}
