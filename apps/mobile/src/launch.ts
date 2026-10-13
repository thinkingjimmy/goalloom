export interface Launch {
  shot: string
  demo: boolean
  dark: boolean
}

export function webLaunch(): Launch {
  const demo = process.env.EXPO_PUBLIC_DEMO === '1'
  if (typeof location === 'undefined') return { shot: '', demo, dark: false }
  const params = new URLSearchParams(location.search)
  const shot = params.get('shot') ?? ''
  return {
    shot,
    demo: demo || params.get('demo') === '1',
    dark: params.get('dark') === '1' || shot.includes('dark'),
  }
}

/** `goalloom://shot/<name>?demo=1&dark=1`. Returns null when the URL is not a screen link. */
export function launchFromUrl(url: string, base: Launch): Launch | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  const params = parsed.searchParams
  let pathShot = ''
  if (parsed.hostname === 'shot') {
    const segment = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? ''
    try { pathShot = decodeURIComponent(segment) } catch { return null }
  }
  const shot = params.get('shot') || pathShot
  if (!shot && params.get('demo') !== '1' && params.get('dark') !== '1') return null
  const next = shot || base.shot
  return {
    shot: next,
    demo: base.demo || params.get('demo') === '1',
    dark: params.get('dark') === '1' || next.includes('dark'),
  }
}
