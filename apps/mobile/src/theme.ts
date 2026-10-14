/**
 * [INPUT]: Light or dark scheme, and the workspace style (paper or minimal).
 * [OUTPUT]: The color, radius and border tokens the mobile UI paints with.
 * [POS]: Desktop token mirror. Paper is the warm default; minimal is the flat zinc skin.
 */

export type Scheme = 'light' | 'dark'
export type BoardStyle = 'paper' | 'minimal'

export interface Theme {
  scheme: Scheme
  style: BoardStyle
  bg: string
  surface: string
  raised: string
  fg: string
  fgSoft: string
  secondary: string
  faint: string
  line: string
  hairline: string
  hover: string
  edge: string
  checkFill: string
  checkEdge: string
  checked: string
  danger: string
  focus: string
  scrim: string
  onAccent: string
  cardRadius: number
  controlRadius: number
  rowRadius: number
  sheetRadius: number
}

const paperLight: Theme = {
  scheme: 'light', style: 'paper',
  bg: '#f5f1eb', surface: '#fbf9f6', raised: '#fffdfa', fg: '#2b2621', fgSoft: '#4a433c',
  secondary: '#6f665c', faint: '#b3a99e', line: 'rgba(90,70,50,0.14)', hairline: 'rgba(90,70,50,0.08)',
  hover: 'rgba(70,50,30,0.06)', edge: 'rgba(40,25,10,0.14)', checkFill: '#e7e2db', checkEdge: 'rgba(90,70,50,0.3)', checked: '#a39a8f',
  danger: '#b4382f', focus: '#547aaa', scrim: 'rgba(40,25,10,0.16)', onAccent: '#fbf9f6',
  cardRadius: 12, controlRadius: 10, rowRadius: 10, sheetRadius: 16,
}

const paperDark: Theme = {
  scheme: 'dark', style: 'paper',
  bg: '#1c1916', surface: '#24201c', raised: '#2b2621', fg: '#ede7df', fgSoft: '#d6cec4',
  secondary: '#a89e93', faint: '#6e655c', line: 'rgba(255,240,220,0.13)', hairline: 'rgba(255,240,220,0.07)',
  hover: 'rgba(255,240,220,0.06)', edge: 'rgba(255,240,220,0.12)', checkFill: '#3a342e', checkEdge: 'rgba(255,240,220,0.28)', checked: '#7d746a',
  danger: '#f08a7e', focus: '#85a8d9', scrim: 'rgba(0,0,0,0.45)', onAccent: '#1c1916',
  cardRadius: 12, controlRadius: 10, rowRadius: 10, sheetRadius: 16,
}

const minimalLight: Theme = {
  scheme: 'light', style: 'minimal',
  bg: '#ffffff', surface: '#ffffff', raised: '#ffffff', fg: '#09090b', fgSoft: '#3f3f46',
  secondary: '#71717a', faint: '#a1a1aa', line: '#e4e4e7', hairline: '#f4f4f5',
  hover: '#f4f4f5', edge: '#e4e4e7', checkFill: '#ffffff', checkEdge: '#d4d4d8', checked: '#a1a1aa',
  danger: '#dc2626', focus: '#18181b', scrim: 'rgba(0,0,0,0.32)', onAccent: '#ffffff',
  cardRadius: 10, controlRadius: 6, rowRadius: 6, sheetRadius: 12,
}

const minimalDark: Theme = {
  scheme: 'dark', style: 'minimal',
  bg: '#09090b', surface: '#09090b', raised: '#18181b', fg: '#fafafa', fgSoft: '#d4d4d8',
  secondary: '#a1a1aa', faint: '#52525b', line: '#27272a', hairline: '#1c1c1f',
  hover: '#27272a', edge: '#27272a', checkFill: '#09090b', checkEdge: '#3f3f46', checked: '#52525b',
  danger: '#f87171', focus: '#fafafa', scrim: 'rgba(0,0,0,0.6)', onAccent: '#09090b',
  cardRadius: 10, controlRadius: 6, rowRadius: 6, sheetRadius: 12,
}

export function themeFor(scheme: Scheme, style: BoardStyle = 'paper'): Theme {
  if (style === 'minimal') return scheme === 'dark' ? minimalDark : minimalLight
  return scheme === 'dark' ? paperDark : paperLight
}
