/**
 * [INPUT]: Depends on @hugeicons/react and @hugeicons/core-free-icons (the app's icon set)
 * [OUTPUT]: Exports Icon (named Hugeicons, decorative by default) and Mark (the Goalloom logo glyph)
 * [POS]: components' only icon source; names match src/renderer/components/icons where the app has the same glyph
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon, AppleIcon, Cancel01Icon, Cursor02Icon, Delete02Icon, Download04Icon, FilterIcon, GitBranchIcon, Globe02Icon,
  GridViewIcon, HistoryIcon, KeyboardIcon, LayoutThreeColumnIcon, Menu01Icon, Moon02Icon, Search01Icon, SlidersHorizontalIcon,
  SparklesIcon, Sun01Icon, Tick02Icon, WindowsNewIcon, ArrowDown01Icon,
} from '@hugeicons/core-free-icons'

const ICONS = {
  add: Add01Icon, apple: AppleIcon, close: Cancel01Icon, cursor: Cursor02Icon, delete: Delete02Icon, download: Download04Icon,
  filter: FilterIcon, split: GitBranchIcon, globe: Globe02Icon, all: GridViewIcon, history: HistoryIcon, keyboard: KeyboardIcon,
  views: LayoutThreeColumnIcon, menu: Menu01Icon, moon: Moon02Icon, search: Search01Icon, settings: SlidersHorizontalIcon,
  smart: SparklesIcon, sun: Sun01Icon, check: Tick02Icon, windows: WindowsNewIcon, expand: ArrowDown01Icon,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, strokeWidth = 1.6 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} strokeWidth={strokeWidth} color="currentColor" aria-hidden="true" />
}

/** The app icon's glyph: one stroke draws the box, rounds the top-right corner and turns into the check. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.1 10V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10.4c1.6 0 2.5 1.9 1.4 3.1L12.6 14c-.5.55-1.2.55-1.7 0L8.4 11.2" />
    </svg>
  )
}
