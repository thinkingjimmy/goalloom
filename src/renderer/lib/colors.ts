/**
 * [INPUT]: 稳定实体 ID；八组固定浅/深色 token。
 * [OUTPUT]: 不随主题变化的 FNV-1a 色板索引和配对色。
 * [POS]: 关联标记的视觉基础；颜色不承担关系身份或状态语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
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

export function relationColorIndex(id: string): number {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
  return (hash >>> 0) % relationColors.length
}
