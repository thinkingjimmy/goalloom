/**
 * [INPUT]: Accepted completion identities, the current workspace generation, device-local motion preferences and the settings preview signal.
 * [OUTPUT]: Two confetti cannons anchored at the exact viewport bottom corners, above board and native dialogs; no business writes.
 * [POS]: Renderer shell feedback, driven only by fresh authoritative completion events.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef } from 'react'
import { onCelebrationPreview, useCelebration, useReducedMotion } from '../../state/celebration'
import type { CompletionEvent } from '../../state/use-workspace'
import './completion-celebration.css'

const duration = 2500
const colors = ['#F5BA35', '#EE715B', '#E16EAA', '#8874DE', '#55A9E3', '#46B8A0', '#F2D77B']

// Cannon model in viewport units: linear drag settles every piece towards its own reach while gravity takes over,
// so slow pieces spill beside the corner, fast ones cross the centre and the cone stays anchored where it was born.
const drag = 1.6
const gravity = 0.65
const reach = 2
const lift = 2.1
const angleMin = 22 * Math.PI / 180
const angleMax = 82 * Math.PI / 180
const perSide = 90

interface Particle {
  side: number
  delay: number
  velocityX: number
  velocityY: number
  width: number
  height: number
  rotation: number
  spin: number
  flutter: number
  color: string
}

function particles(): Particle[] {
  return Array.from({ length: perSide * 2 }, (_, index) => {
    // Stratify launch angle and speed independently so every burst has steep, flat, slow and far-reaching pieces.
    const angle = angleMin + (angleMax - angleMin) * ((index % perSide + Math.random()) / perSide)
    const speed = 0.14 + 0.86 * (((index * 37) % perSide + Math.random()) / perSide)
    return {
      side: index < perSide ? 1 : -1,
      // One seed per side leaves on the first frame; the rest form a dense burst with a tail streaming until ~450 ms.
      delay: index % perSide === 0 ? 0 : 0.005 + 0.45 * Math.random() ** 3,
      velocityX: speed * Math.cos(angle) * reach,
      velocityY: speed * Math.sin(angle) * lift,
      width: 5 + Math.random() * 4,
      height: 8 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (3 + Math.random() * 6) * (Math.random() < 0.5 ? -1 : 1),
      flutter: Math.random() * Math.PI * 2,
      color: colors[index % colors.length]!,
    }
  })
}

function celebrate(canvas: HTMLCanvasElement, operationId: string): () => void {
  let context: CanvasRenderingContext2D | null
  try { context = canvas.getContext('2d') } catch { return () => undefined }
  if (!context) return () => undefined

  let frame = 0
  let stopped = false
  let width = 0
  let height = 0
  let scale = 1

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    delete canvas.dataset.operationId
    // Release the backing store as soon as this short-lived effect finishes.
    canvas.width = 1
    canvas.height = 1
    try { if (canvas.matches(':popover-open')) canvas.hidePopover() } catch { /* Visual feedback must never interrupt a saved completion. */ }
  }

  const resize = () => {
    try {
      width = window.innerWidth
      height = window.innerHeight
      scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
    } catch { stop() }
  }

  try {
    canvas.showPopover()
    canvas.dataset.operationId = operationId
    resize()
    if (stopped) return stop
    window.addEventListener('resize', resize)
    const pieces = particles()
    const started = performance.now()

    const draw = (now: number) => {
      if (stopped) return
      try {
        const elapsed = now - started
        if (elapsed >= duration || document.hidden) { stop(); return }
        const seconds = elapsed / 1000
        context.setTransform(scale, 0, 0, scale, 0, 0)
        context.clearRect(0, 0, width, height)
        context.globalAlpha = Math.min(1, (duration - elapsed) / 650)

        for (const piece of pieces) {
          const time = seconds - piece.delay
          if (time < 0) continue
          // Closed-form motion under linear drag: settle is the decayed travel time, and gravity acts through the same drag.
          const settle = (1 - Math.exp(-drag * time)) / drag
          const inward = width * piece.velocityX * settle
          // Flutter starts at zero: even the first visible pixels come from the viewport corner.
          const flutter = (Math.sin(time * 4 + piece.flutter) - Math.sin(piece.flutter)) * 8
          const x = (piece.side === 1 ? inward : width - inward) + flutter
          const y = height - height * (piece.velocityY * settle - gravity * (time - settle) / drag)
          if (y > height + 20 || y < -20) continue
          context.save()
          context.translate(x, y)
          context.rotate(piece.rotation + piece.spin * time)
          context.scale(0.25 + Math.abs(Math.cos(time * 7 + piece.flutter)) * 0.75, 1)
          context.fillStyle = piece.color
          context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height)
          context.restore()
        }

        frame = requestAnimationFrame(draw)
      } catch { stop() }
    }

    // Draw the two corner seeds immediately, before the first advancing animation frame.
    draw(started)
  } catch { stop() }
  return stop
}

export function CompletionCelebration({ event, generation }: { event: CompletionEvent | null; generation: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const accepted = useRef<string | null>(null)
  const stop = useRef<() => void>(() => undefined)
  const { enabled } = useCelebration()
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const identity = event ? `${event.generation}:${event.operationId}` : null
    const fresh = identity !== null && identity !== accepted.current
    // Consume even disabled events so changing a preference cannot replay old work.
    if (fresh) accepted.current = identity
    if (!event || event.generation !== generation || reducedMotion || !enabled[event.horizon] || document.hidden) {
      stop.current()
      return
    }
    if (!fresh || !canvas.current) return
    stop.current()
    stop.current = celebrate(canvas.current, event.operationId)
  }, [event, generation, enabled, reducedMotion])

  // A settings preview is not a completion: it plays regardless of column switches but never under reduced motion.
  useEffect(() => onCelebrationPreview(() => {
    if (reducedMotion || document.hidden || !canvas.current) return
    stop.current()
    stop.current = celebrate(canvas.current, 'preview')
  }), [reducedMotion])

  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) stop.current() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop.current()
    }
  }, [])

  return <canvas ref={canvas} className="completion-celebration" width={1} height={1} popover="manual" aria-hidden="true" />
}
