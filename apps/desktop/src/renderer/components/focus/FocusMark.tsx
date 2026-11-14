/**
 * [INPUT]: A focus scope (month/week/day), optional flow colour and the board's guarded toggle action.
 * [OUTPUT]: Labelled review capsule and a board star that retains keyboard focus while a write is blocked.
 * [POS]: Shared focus visuals; Board columns decide eligibility and submit the guarded `focus` command.
 */
import type { CSSProperties } from 'react'
import { insightMessages as t } from '../../i18n'
import { Icon } from '../icons'
import './focus.css'

export type FocusScope = 'month' | 'week' | 'day'
export const focusScopes: readonly FocusScope[] = ['month', 'week', 'day']
export const isFocusScope = (horizon: string): horizon is FocusScope => (focusScopes as readonly string[]).includes(horizon)

// `past` marks a closed period's focus in reviews: outlined and quieter than the current one.
export function FocusMark({ scope, color, past = false }: { scope: FocusScope; color?: string | undefined; past?: boolean }) {
  const label = past ? t.focusPast[scope] : t.focusName[scope]
  const style = color ? { '--focus-color': color } as CSSProperties : undefined
  return <span className="focus-mark" data-past={past} style={style}><Icon name="star" size={12} strokeWidth={2} /><span>{label}</span></span>
}

export function FocusToggle({ scope, active, color, disabled, blocked, onToggle }: {
  scope: FocusScope; active: boolean; color?: string | undefined; disabled: boolean; blocked: boolean; onToggle: () => void
}) {
  const label = t.focusName[scope]
  const style = active && color ? { '--focus-color': color } as CSSProperties : undefined
  // Native disabling would blur the star before the save returns.
  return <button type="button" className="focus-toggle" style={style} disabled={disabled} aria-disabled={blocked || undefined} aria-label={label} aria-pressed={active}
    title={active ? t.focusClear(label) : t.focusSet(label)}
    onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (!blocked) onToggle() }}><Icon name="star" size={14} /></button>
}
