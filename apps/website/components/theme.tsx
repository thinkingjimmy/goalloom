'use client'
/**
 * [INPUT]: React, pre-paint theme contract, shared icons and native circular theme transition.
 * [OUTPUT]: ThemeRuntime follows the system; ThemeToggle persists choices and reveals pointer changes from the button.
 * [POS]: components' owner of the auto/light/dark mode behind <html data-theme>; the whole page reads the tokens
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import { THEME_KEY, THEME_QUERY } from './boot'
import { Icon } from './icons'
import { transitionTheme } from './theme-transition'

type Theme = 'light' | 'dark'
type Mode = 'auto' | Theme

const readMode = (value?: string): Mode => (value === 'light' || value === 'dark' ? value : 'auto')
const systemTheme = (): Theme => (matchMedia(THEME_QUERY).matches ? 'dark' : 'light')

let holds = 0
let requestedTheme: Theme | undefined
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
    const sync = () => {
      if (!requestedTheme && readMode(document.documentElement.dataset.themeMode) === 'auto') transitionTheme(() => apply('auto'))
    }
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
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const current = requestedTheme ?? document.documentElement.dataset.theme
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    const mode: Mode = next === systemTheme() ? 'auto' : next
    requestedTheme = next
    transitionTheme(() => {
      apply(mode)
      try { if (mode === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, mode) } catch { /* storage is optional */ }
      requestedTheme = undefined
    }, event.detail > 0 ? event.currentTarget : undefined)
  }
  const label = theme === 'dark' ? toLight : toDark
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={toggle}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  )
}
