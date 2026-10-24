'use client'
/**
 * [INPUT]: Localized intro copy, local brand asset and bundled silent product-tour media.
 * [OUTPUT]: VideoIntro, an inverse-theme typographic cover and native click-to-play video without an exterior caption.
 * [POS]: ProductTour video figure; pauses offscreen/when hidden, never fetches a third-party embed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { SiteCatalog } from '@/lib/i18n'

export function VideoIntro({ copy }: { copy: SiteCatalog['intro'] }) {
  const player = useRef<HTMLDetailsElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const request = useRef(0)
  const [failed, setFailed] = useState(false)
  const id = useId()

  useEffect(() => {
    const media = video.current, frame = player.current
    if (!media || !frame) return
    const pause = () => { request.current++; media.pause() }
    const onVisibility = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', onVisibility)
    let seen = false
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) seen = true
      else if (seen) pause()
    })
    observer.observe(frame)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); pause() }
  }, [])

  const close = () => {
    request.current++
    video.current?.pause()
    if (player.current) player.current.open = false
    if (document.activeElement === video.current || document.activeElement === player.current?.querySelector('summary')) trigger.current?.focus({ preventScroll: true })
  }
  const showError = () => { if (player.current?.open) { close(); setFailed(true) } }
  const play = async (from: HTMLElement) => {
    const media = video.current, frame = player.current
    if (!media || !frame) return
    trigger.current = from
    const current = ++request.current
    setFailed(false)
    frame.open = true
    frame.scrollIntoView({ block: 'nearest' })
    if (media.error) media.load()
    if (media.ended) media.currentTime = 0
    try {
      await media.play()
      if (request.current !== current) return
      media.focus({ preventScroll: true })
    } catch {
      if (request.current === current && frame.open) showError()
    }
  }

  return <figure className="intro-media">
      <details className="intro-player" id={`${id}-player`} ref={player}>
        <summary onClick={event => {
          event.preventDefault()
          if (player.current?.open) close()
          else void play(event.currentTarget)
        }}>
          <span className="intro-cover" aria-hidden="true">
            <span className="intro-brand"><img src="/app-icon.png" alt="" width={22} height={22} draggable={false} />{copy.caption}</span>
            <span className="intro-cover-title">{copy.coverTitle.map(line => <span key={line}>{line}{' '}</span>)}</span>
            <span className="intro-cover-footer"><span>{copy.coverFootnote}</span><span className="intro-play">{copy.watch}</span></span>
          </span>
          <span className="intro-play-label sr-only">{copy.play}</span>
          <span className="intro-reset">{copy.reset}</span>
        </summary>
        <video ref={video} src="/product-tour.mp4" controls playsInline preload="none" width={960} height={540} tabIndex={0} aria-label={copy.videoLabel} aria-describedby={`${id}-description`} onError={showError} />
      </details>
      <p className="sr-only" id={`${id}-description`}>{copy.transcript}</p>
      <p className="intro-status" role="status" hidden={!failed}>{copy.error}</p>
    </figure>
}
