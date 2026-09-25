/**
 * [INPUT]: Editable drafts and parent metadata.
 * [OUTPUT]: Plan: Jev's recommendation read as a result (one sentence for a single draft, one line per draft otherwise), each draft's first doubt as a muted aside; JevBadge; where/doubtText labels shared with DraftRow.
 * [POS]: Read-only view of the composer's candidate strip; editing happens in DraftRow after Tab.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemHorizon } from '../../../shared/contracts/entities'
import { horizonNames, smartMessages as t } from '../../i18n'
import { shortDate } from '../../i18n/format'
import { Icon } from '../../components/icons'
import type { EditableDraft, ParentInfo } from './draft'
import { doubts, parentTitle, type Doubt } from './suggestions'

export const JevBadge = () => <span className="jev-badge"><Icon name="smart" size={12} />Jev</span>
export const column = (horizon: ItemHorizon) => horizon === 'later' ? 'Later' : horizonNames[horizon]
export function doubtText(doubt: Doubt): string {
  if (doubt.kind === 'role') return t.maybeMerge(doubt.previous)
  if (doubt.kind === 'parent') return doubt.move ? t.maybeParentMove(doubt.title, horizonNames[doubt.move]) : t.maybeParent(doubt.title)
  if (doubt.kind === 'horizon') return t.maybeHorizon(horizonNames[doubt.horizon])
  return t.maybeDue(shortDate(doubt.date))
}
// Short trailing label: column, deadline and any existing parent (a draft parent shows as indentation instead).
export function where(draft: EditableDraft, drafts: EditableDraft[], parents: Map<string, ParentInfo>): string {
  const outside = draft.parents.filter(key => key.kind === 'existing').map(key => parentTitle(key, drafts, parents))
  return [outside.length ? `↑ ${outside.join(t.comma)}` : null, column(draft.horizon), draft.due ? t.dueShort(shortDate(draft.due)) : null].filter(Boolean).join(' · ')
}

export function Plan({ drafts, parents }: { drafts: EditableDraft[]; parents: Map<string, ParentInfo> }) {
  if (drafts.length === 1) {
    const draft = drafts[0]!, doubt = doubts(draft, drafts, parents)[0]
    const under = draft.parents.map(key => parentTitle(key, drafts, parents))
    const sentence = [t.placeTo(column(draft.horizon)), draft.due ? t.dueOn(shortDate(draft.due)) : null, under.length ? t.under(under) : null].filter(Boolean).join(t.comma)
    return <div className="composer-plan" data-single="true">
      <p className="plan-sentence">{sentence}</p>
      {doubt && <p className="plan-doubt">{doubtText(doubt)}</p>}
    </div>
  }
  return <ul className="composer-plan" aria-label={t.planLabel(drafts.length)}>
    {drafts.map(draft => {
      const doubt = doubts(draft, drafts, parents)[0]
      return <li key={draft.id} className="plan-line" data-indent={draft.parents.some(key => key.kind === 'draft')} data-orphan={draft.orphan}>
        <span className="plan-title">{draft.title || t.titleRequired}</span>
        <span className="plan-where">· {where(draft, drafts, parents)}</span>
        {doubt && <span className="plan-doubt">{doubtText(doubt)}</span>}
      </li>
    })}
  </ul>
}
