/**
 * [INPUT]: 浏览器 KeyboardEvent（按物理键 code 解析）、本机 localStorage、navigator 平台。
 * [OUTPUT]: 快捷键定义表 shortcutIds/defaultBindings、按顶栏位置的 filterCombo/filterSlot、parseEvent/validate/formatKeys/formatCombo/ariaKeys/conflictsOf 纯函数，useShortcuts（绑定、流程筛选开关、改键、清除、恢复默认）。
 * [POS]: renderer/state 的本机键位偏好，App/设置/composer/详情/顶栏共用的唯一来源；不进入工作区数据、历史、导出或备份，读写失败时退回默认。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export const shortcutIds = ['palette', 'compose', 'settings', 'undo', 'submit'] as const
export type ShortcutId = typeof shortcutIds[number]
/** A combo is `Mod+Alt+Shift+Key` in that fixed order; `null` means unbound. */
export type Bindings = Record<ShortcutId, string | null>

export const defaultBindings: Bindings = { palette: 'Mod+K', compose: 'Mod+N', settings: 'Mod+,', undo: 'Mod+Z', submit: 'Mod+Enter' }

// Filters follow chip position like browser tabs: ⌘1 is 全部, ⌘2…⌘9 the visible flows in bar order. One switch, no per-slot keys.
export const filterSlots = 9
export const filterCombo = (enabled: boolean, index: number): string | null => enabled && index >= 0 && index < filterSlots ? `Mod+${index + 1}` : null
/** Chip index for a pressed combo, or -1 when filters are off or the combo is not ⌘1…⌘9. */
export function filterSlot(enabled: boolean, combo: string): number {
  const digit = enabled ? /^Mod\+([1-9])$/.exec(combo) : null
  return digit ? Number(digit[1]) - 1 : -1
}

const named: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  Enter: 'Enter', NumpadEnter: 'Enter', Space: 'Space', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
}

/** Physical key name, so Shift or an IME never turns ⌘2 into ⌘@. Modifier-only and Escape presses have no key. */
function keyOf(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code), digit = /^(?:Digit|Numpad)(\d)$/.exec(code), fn = /^F([1-9]|1[0-2])$/.exec(code)
  return letter?.[1] ?? digit?.[1] ?? (fn ? code : named[code] ?? null)
}

export function parseEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  const key = keyOf(event.code)
  if (!key) return null
  return [event.metaKey || event.ctrlKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+')
}

/** True for a real press of the bound combo; IME composition never triggers a shortcut. */
export function matches(event: KeyboardEvent | ReactKeyboardEvent, combo: string | null): boolean {
  const composing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing
  return !!combo && !composing && parseEvent(event) === combo
}

// Clipboard/select-all and the default Electron menu (quit, close, hide, minimise, reload, zoom, dev tools) own these.
const reserved = new Set(['Mod+C', 'Mod+V', 'Mod+X', 'Mod+A', 'Mod+Q', 'Mod+W', 'Mod+H', 'Mod+M', 'Mod+R', 'Mod+Shift+R', 'Mod+0', 'Mod+=', 'Mod+-', 'Mod+Shift+=', 'Mod+Alt+I', 'Mod+Shift+Z'])
export type ComboProblem = 'modifier' | 'reserved'
export function validate(combo: string): ComboProblem | null {
  if (!combo.startsWith('Mod+') && !combo.startsWith('Alt+')) return 'modifier'
  return reserved.has(combo) ? 'reserved' : null
}

const mac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
const glyphs: Record<string, string> = mac
  ? { Mod: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↵', Backspace: '⌫', Delete: '⌦', Tab: '⇥', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: '␣' }
  : { Mod: 'Ctrl', Enter: 'Enter', Up: '↑', Down: '↓', Left: '←', Right: '→' }
export const formatKeys = (combo: string): string[] => combo.split('+').map(part => glyphs[part] ?? part)
export const formatCombo = (combo: string | null): string => combo ? formatKeys(combo).join(mac ? '' : '+') : ''
/** WAI-ARIA `aria-keyshortcuts` value for the same combo. */
export function ariaKeys(combo: string | null): string | undefined {
  if (!combo) return undefined
  const aria: Record<string, string> = { Mod: mac ? 'Meta' : 'Control', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' }
  return combo.split('+').map(part => aria[part] ?? part).join('+')
}

/** Other shortcuts (or the flow filters) on the same combo; scoped ones may share keys legitimately, so this only warns. */
export type ConflictId = ShortcutId | 'filters'
export function conflictsOf(bindings: Bindings, filters: boolean, id: ShortcutId): ConflictId[] {
  const combo = bindings[id]
  if (!combo) return []
  const others: ConflictId[] = shortcutIds.filter(other => other !== id && bindings[other] === combo)
  return filterSlot(filters, combo) >= 0 ? [...others, 'filters'] : others
}

const storageKey = 'goalloom.shortcuts'
const isCombo = (value: unknown): value is string => typeof value === 'string' && /^(Mod\+)?(Alt\+)?(Shift\+)?[^+]+$/.test(value) && !validate(value)

// Only differences from the defaults are stored: rebound keys plus `filters: false` when the position filters are off.
type Stored = Partial<Bindings> & { filters?: false }
function load(): Stored {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    const stored = value as Record<string, unknown>
    const keys: Stored = Object.fromEntries(shortcutIds.filter(id => id in stored && (stored[id] === null || isCombo(stored[id]))).map(id => [id, stored[id]]))
    return stored.filters === false ? { ...keys, filters: false } : keys
  } catch { return {} }
}

interface State { bindings: Bindings; filters: boolean }
const derive = (stored: Stored): State => {
  const { filters, ...keys } = stored
  return { bindings: { ...defaultBindings, ...keys }, filters: filters !== false }
}
let overrides = load()
let state = derive(overrides)
const listeners = new Set<() => void>()
function save(next: Stored) {
  overrides = next
  state = derive(overrides)
  try { localStorage.setItem(storageKey, JSON.stringify(overrides)) } catch { /* Device preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export interface Shortcuts {
  bindings: Bindings; filters: boolean; customized: boolean
  set: (id: ShortcutId, combo: string | null) => void; setFilters: (enabled: boolean) => void; reset: () => void
}
export function useShortcuts(): Shortcuts {
  const current = useSyncExternalStore(subscribe, () => state)
  return {
    bindings: current.bindings,
    filters: current.filters,
    customized: !current.filters || shortcutIds.some(id => current.bindings[id] !== defaultBindings[id]),
    set: (id, combo) => {
      const { [id]: _, ...rest } = overrides
      save(combo === defaultBindings[id] ? rest : { ...rest, [id]: combo })
    },
    setFilters: enabled => {
      const { filters: _, ...rest } = overrides
      save(enabled ? rest : { ...rest, filters: false })
    },
    reset: () => save({}),
  }
}
