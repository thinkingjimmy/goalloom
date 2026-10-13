/**
 * [INPUT]: Flow palette index 0–7 and light or dark.
 * [OUTPUT]: Checkbox stroke and tint. Stroke is the third desktop token; two flows split on a 135° diagonal.
 * [POS]: Visual tokens copied from apps/desktop/src/renderer/lib/colors.ts. No CSS runtime.
 */

export const flowPalette = [
  { light: ['#e8f0e6', '#285128', '#567a53'], dark: ['#263927', '#c5e7bf', '#83af7b'] },
  { light: ['#e7eef8', '#244979', '#547aaa'], dark: ['#263449', '#c1d9ff', '#85a8d9'] },
  { light: ['#f0e8f6', '#653477', '#9065a3'], dark: ['#3b2c46', '#e7c7f5', '#bd91d2'] },
  { light: ['#f9e8ec', '#852f4a', '#b3617b'], dark: ['#462c36', '#fac5d6', '#d790a8'] },
  { light: ['#f7eadb', '#754713', '#a47743'], dark: ['#403323', '#f4d7ad', '#c4a06f'] },
  { light: ['#e2f0ef', '#225650', '#4e817a'], dark: ['#233b38', '#b7e6dc', '#7caf9f'] },
  { light: ['#f2efdc', '#605719', '#8d8243'], dark: ['#3a3825', '#e7e0a5', '#b2ab70'] },
  { light: ['#e9ecf0', '#3c485a', '#707d91'], dark: ['#303741', '#d1dbea', '#9aabc0'] },
] as const

export type Scheme = 'light' | 'dark'

export function flowStroke(index: number, scheme: Scheme): string {
  return flowPalette[index]![scheme][2]
}

export function flowTint(index: number, scheme: Scheme): string {
  return flowPalette[index]![scheme][0]
}

export function flowRing(indices: readonly number[], scheme: Scheme): { kind: 'solid'; color: string } | { kind: 'split'; from: string; to: string } | null {
  if (!indices.length) return null
  const from = flowStroke(indices[0]!, scheme)
  const second = indices[1]
  if (second === undefined) return { kind: 'solid', color: from }
  return { kind: 'split', from, to: flowStroke(second, scheme) }
}
