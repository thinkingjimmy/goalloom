/**
 * [INPUT]: A synchronous theme commit, optional button origin and native View Transition/WAAPI support.
 * [OUTPUT]: transitionTheme; a 550ms circular reveal with immediate, reduced-motion and failure fallbacks.
 * [POS]: Browser animation boundary shared by all website theme controls; no theme storage or React dependency.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
let revision = 0
let activeTransition: ViewTransition | undefined
let activeAnimation: Animation | undefined

export function transitionTheme(update: () => void, origin?: HTMLElement) {
  const id = ++revision
  activeAnimation?.cancel()
  activeTransition?.skipTransition()
  activeAnimation = undefined
  activeTransition = undefined
  const root = document.documentElement
  delete root.dataset.themeTransition
  let committed = false
  const commit = () => {
    if (id !== revision || committed) return
    committed = true
    update()
  }
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  if (!origin || motion.matches || document.hidden || !document.startViewTransition || !root.animate) {
    commit()
    return
  }

  const { left, top, width, height } = origin.getBoundingClientRect()
  const x = left + width / 2, y = top + height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  root.dataset.themeTransition = 'circle'
  let transition: ViewTransition
  try {
    transition = document.startViewTransition(commit)
  } catch {
    delete root.dataset.themeTransition
    commit()
    return
  }
  activeTransition = transition
  let animation: Animation | undefined
  const stop = () => {
    animation?.cancel()
    transition.skipTransition()
  }
  const onMotion = () => { if (motion.matches) stop() }
  const onVisibility = () => { if (document.hidden) stop() }
  motion.addEventListener('change', onMotion)
  document.addEventListener('visibilitychange', onVisibility)
  void transition.ready.then(() => {
    if (id !== revision || motion.matches || document.hidden) { stop(); return }
    animation = root.animate({
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
    }, { duration: 550, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' })
    activeAnimation = animation
    void animation.finished.catch(() => {})
  }).catch(() => { commit(); stop() })
  void transition.finished.catch(commit).finally(() => {
    motion.removeEventListener('change', onMotion)
    document.removeEventListener('visibilitychange', onVisibility)
    if (id !== revision) return
    activeTransition = undefined
    activeAnimation = undefined
    delete root.dataset.themeTransition
  })
}
