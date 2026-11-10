/**
 * [INPUT]: A focus scope (month/week/day), optional flow colour and an optional clear action.
 * [OUTPUT]: FocusMark — the "most important" capsule (filled star + label) for board rows and reviews; FocusToggle — the hover star that sets it.
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
export function FocusMark({ scope, color, past = false, onClear, disabled }: { scope: FocusScope; color?: string | undefined; past?: boolean; onClear?: (() => void) | undefined; disabled?: boolean }) {
  const label = past ? t.focusPast[scope] : t.focusName[scope]
  const style = color ? { '--focus-color': color } as CSSProperties : undefined
  const content = <><Icon name="star" size={12} strokeWidth={2} /><span>{label}</span></>
  if (!onClear) return <span className="focus-mark" data-past={past} style={style}>{content}</span>
  return <button type="button" className="focus-mark" style={style} disabled={disabled} title={t.focusClear(label)} aria-label={t.focusClear(label)}
    onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onClear() }}>{content}</button>
}

export function FocusToggle({ scope, onSet, disabled }: { scope: FocusScope; onSet: () => void; disabled?: boolean }) {
  const label = t.focusSet(t.focusName[scope])
  return <button type="button" className="focus-toggle" disabled={disabled} title={label} aria-label={label}
    onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onSet() }}><Icon name="star" size={14} /></button>
}
