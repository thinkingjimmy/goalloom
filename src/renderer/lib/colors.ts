/**
 * [INPUT]: 流程根持久化的 0–7 色板索引。
 * [OUTPUT]: 八组固定浅/深色 token（色名在 i18n messages.colorNames），复选框描边/淡底的 CSS 值（flowStroke/flowRing/flowTint），以及一次写入两者的 flowVars。
 * [POS]: 流程颜色的视觉基础；颜色只辅助识别，名称与状态另有文字。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CSSProperties } from 'react'

export const relationColors = [
  { light: ['#e8f0e6', '#285128', '#567a53'], dark: ['#263927', '#c5e7bf', '#83af7b'] },
  { light: ['#e7eef8', '#244979', '#547aaa'], dark: ['#263449', '#c1d9ff', '#85a8d9'] },
  { light: ['#f0e8f6', '#653477', '#9065a3'], dark: ['#3b2c46', '#e7c7f5', '#bd91d2'] },
  { light: ['#f9e8ec', '#852f4a', '#b3617b'], dark: ['#462c36', '#fac5d6', '#d790a8'] },
  { light: ['#f7eadb', '#754713', '#a47743'], dark: ['#403323', '#f4d7ad', '#c4a06f'] },
  { light: ['#e2f0ef', '#225650', '#4e817a'], dark: ['#233b38', '#b7e6dc', '#7caf9f'] },
  { light: ['#f2efdc', '#605719', '#8d8243'], dark: ['#3a3825', '#e7e0a5', '#b2ab70'] },
  { light: ['#e9ecf0', '#3c485a', '#707d91'], dark: ['#303741', '#d1dbea', '#9aabc0'] },
] as const

export function flowStroke(index: number): string {
  const palette = relationColors[index]!
  return `light-dark(${palette.light[2]}, ${palette.dark[2]})`
}
// Border-box gradient under an opaque padding-box fill: one colour, or a diagonal split for two flows.
export function flowRing(indices: number[]): string | undefined {
  if (!indices.length) return undefined
  const [a, b] = indices.map(flowStroke)
  return b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : `linear-gradient(${a}, ${a})`
}
export function flowTint(index: number): string {
  const palette = relationColors[index]!
  return `light-dark(${palette.light[0]}, ${palette.dark[0]})`
}
// Ring plus the matching tint, so every checkbox style (outline / paper / tint) can pick what it needs.
export function flowVars(indices: number[]): CSSProperties | undefined {
  if (!indices.length) return undefined
  const [a, b] = indices.map(flowTint)
  return { '--flow-ring': flowRing(indices), '--flow-tint': b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : `linear-gradient(${a}, ${a})` } as CSSProperties
}
