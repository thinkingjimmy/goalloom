/**
 * [INPUT]: Review-scoped item summaries, flows, focus scope and per-screen row actions.
 * [OUTPUT]: ReviewColumn (a board column inside the review dialog), ReviewRow (read-only, two-choice or pickable rows) and ReviewChoice.
 * [POS]: Presentational layer of the review dialog; ReviewDialog owns state, reads and guarded writes.
 */
import type { ReactNode } from 'react'
import type { ItemSummary } from '../../../shared/contracts/entities'
import { flowStroke, flowVars } from '../../lib/colors'
import type { Flows } from '../../state/flows'
import { Icon } from '../../components/icons'
import { LinkText } from '../../components/links/LinkText'

export function ReviewColumn({ title, meta, quiet = false, wide = false, children }: { title: string; meta?: string; quiet?: boolean; wide?: boolean; children: ReactNode }) {
  return <section className="rv-col" data-quiet={quiet} data-wide={wide} aria-label={title}>
    <h3>{title}{meta && <small>{meta}</small>}</h3>
    {children}
  </section>
}

// Two explicit destinations in the product's own words (e.g. 移到本周 / 移到 Later).
export function ReviewChoice({ value, yes, no, label, disabled, onChange }: { value: boolean; yes: string; no: string; label: string; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <span className="rv-seg" role="radiogroup" aria-label={label}>
    <button type="button" role="radio" aria-checked={value} disabled={disabled} onClick={() => onChange(true)}>{yes}</button>
    <button type="button" role="radio" aria-checked={!value} disabled={disabled} onClick={() => onChange(false)}>{no}</button>
  </span>
}

export const flowColorOf = (flows: Flows, id: string): string | undefined => {
  const color = flows.colorsOf(id)[0]
  return color === undefined ? undefined : flowStroke(color)
}

// `step` = a child-horizon item listed under its parent; `lit` = checked by the replay.
export function ReviewRow({ item, flows, lit, step = false, draft = false, children }: { item: ItemSummary | { id: string; title: string }; flows: Flows; lit?: boolean; step?: boolean; draft?: boolean; children?: ReactNode }) {
  const done = lit ?? ('status' in item && item.status === 'done')
  return <div className="rv-row" data-step={step} data-done={done} data-draft={draft} data-item-id={item.id}>
    {draft ? <span className="rv-spark" style={{ color: flowColorOf(flows, item.id) }}><Icon name="smart" size={14} /></span>
      : <span className="check review-todo-check" aria-hidden="true" data-checked={done} style={done ? undefined : flowVars(flows.colorsOf(item.id))}>{done && <Icon name="check" size={12} strokeWidth={2.5} />}</span>}
    <span className="rv-title"><LinkText text={item.title} /></span>
    {children}
  </div>
}

export function ReviewPick({ item, flows, on, label, hint, onPick, mark }: { item: ItemSummary; flows: Flows; on: boolean; label: string; hint: string; onPick: () => void; mark: ReactNode }) {
  // A div radio, not a button: saved-link titles render anchors, which cannot nest inside a button.
  return <div role="radio" tabIndex={0} aria-checked={on} aria-label={`${label}：${item.title}`} className="rv-row rv-pick" data-on={on} data-item-id={item.id} onClick={onPick}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick() } }}>
    <span className="check review-todo-check" aria-hidden="true" data-checked={item.status === 'done'} style={flowVars(flows.colorsOf(item.id))}>{item.status === 'done' && <Icon name="check" size={12} strokeWidth={2.5} />}</span>
    <span className="rv-title"><LinkText text={item.title} /></span>
    {on ? mark : <span className="rv-pick-hint">{hint}</span>}
  </div>
}
