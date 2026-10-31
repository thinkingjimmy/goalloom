/**
 * [INPUT]: Setup/AI scenes, real calendar data and explicit input modality.
 * [OUTPUT]: One persistent, independently clipped product canvas; lazy page changes add no loading row or layout space.
 * [POS]: App-owned first-run stage; feature forms publish read-only scenes without workspace writes.
 */
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { SetupCanvas, type PreviewCalendar, type SetupCamera } from './SetupCanvas'
import { AiPreview, InsightPreviewCard } from './preview/AiPreview'
import './setup-canvas.css'

export interface OnboardingScene {
  live: PreviewCalendar; direction: string; target: PlanningPeriod | undefined; camera: SetupCamera
}
const StageContext = createContext<{
  publish: (scene: OnboardingScene | null) => void
  current: () => OnboardingScene | null
  motion: (keyboard: boolean) => void
} | null>(null)
export const useOnboardingStage = () => useContext(StageContext)

export function OnboardingStage({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState<OnboardingScene | null>(null)
  const latest = useRef(scene); latest.current = scene
  const root = useRef<HTMLDivElement>(null)
  const previousTop = useRef<number | null>(null)
  const arrival = useRef<Animation | null>(null)
  const context = useMemo(() => ({
    publish: setScene,
    current: () => latest.current,
    motion: (keyboard: boolean) => {
      if (root.current) root.current.dataset.motion = keyboard || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'animated'
    },
  }), [])
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const settle = () => {
      if (!document.hidden && !reduced.matches) return
      context.motion(true)
      root.current?.getAnimations({ subtree: true }).forEach(animation => animation.cancel())
    }
    document.addEventListener('visibilitychange', settle); reduced.addEventListener('change', settle)
    return () => { document.removeEventListener('visibilitychange', settle); reduced.removeEventListener('change', settle) }
  }, [context])
  const ai = scene?.camera === 'smart' || scene?.camera === 'insight'
  useLayoutEffect(() => {
    arrival.current?.cancel()
    const canvas = root.current?.querySelector<HTMLElement>('.setup-canvas')
    const before = previousTop.current
    previousTop.current = canvas?.getBoundingClientRect().top ?? null
    if (canvas && before !== null && previousTop.current !== null && Math.abs(before - previousTop.current) > 1 && root.current?.dataset.motion === 'animated' && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      arrival.current = canvas.animate([{ transform: `translateY(${before - previousTop.current}px)` }, { transform: 'translateY(0)' }], { duration: 440, easing: 'cubic-bezier(.65,0,.35,1)' })
    }
    return () => arrival.current?.cancel()
  }, [ai, scene?.camera])
  return <StageContext.Provider value={context}><div ref={root} className="onboarding-stage" data-ai={ai}
    onPointerDownCapture={() => context.motion(false)} onKeyDownCapture={() => context.motion(true)}>
    <div className="onboarding-stage-content"><Suspense fallback={null}>{children}</Suspense></div>
    {scene && <SetupCanvas live={scene.live} direction={scene.direction} target={scene.target} camera={scene.camera} worldRef={null}
      halfContent={scene.camera === 'insight' ? period => <InsightPreviewCard period={period} direction={scene.direction} /> : undefined}>
      {ai && <AiPreview scene={scene} />}
    </SetupCanvas>}
  </div></StageContext.Provider>
}
