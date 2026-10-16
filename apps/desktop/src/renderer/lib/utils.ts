/**
 * [INPUT]: Conditional class values and the renderer's named radius, shadow and menu-spacing tokens.
 * [OUTPUT]: cn merges conditional utilities and named theme aliases; collision-prone DOM markers stay outside merging.
 * [POS]: Shared Tailwind class composition for renderer components.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const merge = extendTailwindMerge({ extend: { theme: {
  radius: ['control', 'action', 'icon-small', 'menu', 'menu-item', 'settings-card'],
  shadow: ['floating', 'settings-card'],
  spacing: ['menu-inset'],
} } })

export function cn(...inputs: ClassValue[]) { return merge(clsx(inputs)) }
