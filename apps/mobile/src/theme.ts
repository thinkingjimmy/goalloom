export type Scheme = 'light' | 'dark'

export interface Theme {
  scheme: Scheme
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
  checkFill: string
  checkEdge: string
  checked: string
  danger: string
  focus: string
  scrim: string
  onAccent: string
}

const light: Theme = {
  scheme: 'light', bg: '#f5f1eb', surface: '#fbf9f6', raised: '#fffdfa', fg: '#2b2621', fgSoft: '#4a433c',
  secondary: '#6f665c', faint: '#b3a99e', line: 'rgba(90,70,50,0.14)', hairline: 'rgba(90,70,50,0.08)',
  hover: 'rgba(70,50,30,0.06)', checkFill: '#e7e2db', checkEdge: 'rgba(90,70,50,0.3)', checked: '#a39a8f',
  danger: '#b4382f', focus: '#547aaa', scrim: 'rgba(40,25,10,0.16)', onAccent: '#fbf9f6',
}

const dark: Theme = {
  scheme: 'dark', bg: '#1c1916', surface: '#24201c', raised: '#2b2621', fg: '#ede7df', fgSoft: '#d6cec4',
  secondary: '#a89e93', faint: '#6e655c', line: 'rgba(255,240,220,0.13)', hairline: 'rgba(255,240,220,0.07)',
  hover: 'rgba(255,240,220,0.06)', checkFill: '#3a342e', checkEdge: 'rgba(255,240,220,0.28)', checked: '#7d746a',
  danger: '#f08a7e', focus: '#85a8d9', scrim: 'rgba(0,0,0,0.45)', onAccent: '#1c1916',
}

export function themeFor(scheme: Scheme): Theme { return scheme === 'dark' ? dark : light }
