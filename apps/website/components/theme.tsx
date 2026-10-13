'use client'
/**
 * [INPUT]: Depends on react, ./boot and ./icons
 * [OUTPUT]: Exports ThemeRuntime (keeps auto mode in step with the system) and ThemeToggle. A swap suspends transitions until the next paint.
 * [POS]: components' owner of the auto/light/dark mode behind <html data-theme>; the whole page reads the tokens
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import { THEME_KEY, THEME_QUERY } from './boot'
import { Icon } from './icons'

type Theme = 'light' | 'dark'
type Mode = 'auto' | Theme

const readMode = (value?: string): Mode => (value === 'light' || value === 'dark' ? value : 'auto')
const systemTheme = (): Theme => (matchMedia(THEME_QUERY).matches ? 'dark' : 'light')

let holds = 0
function apply(mode: Mode) {
  const root = document.documentElement
  holds += 1
  root.classList.add('no-transitions')
  root.dataset.themeMode = mode
  root.dataset.theme = mode === 'auto' ? systemTheme() : mode
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      holds -= 1
      if (holds === 0) root.classList.remove('no-transitions')
    })
  })
}

export function ThemeRuntime() {
  useEffect(() => {
    const query = matchMedia(THEME_QUERY)
    const sync = () => { if (readMode(document.documentElement.dataset.themeMode) === 'auto') apply('auto') }
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return null
}

/** Flips the rendered theme; choosing the system's own theme returns to auto, so the site follows the OS again. */
export function ThemeToggle({ toDark, toLight, className }: { toDark: string; toLight: string; className: string }) {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const mode: Mode = next === systemTheme() ? 'auto' : next
    apply(mode)
    try { if (mode === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, mode) } catch { /* storage is optional */ }
  }
  const label = theme === 'dark' ? toLight : toDark
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={toggle}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  )
}
