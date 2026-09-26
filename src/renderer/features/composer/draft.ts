/**
 * [INPUT]: Smart preview, previous edits, original preview periods and flow constraints.
 * [OUTPUT]: Manual-priority draft merging that adopts Jev's half-sure column and parent reads (moving a draft to childHorizon of its parent when the new-link rule needs it; manual fields or rule conflicts keep them as suggestions), orphan handling and versioned createPlan payloads.
 * [POS]: Pure composer state; preserves period identity instead of rebasing stale previews.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { planProblem } from '../../../domain/plan'
import { mayParent } from '../../../domain/relations'
import { plainLater } from '../../../domain/smart/segments'
import type { ParentRef } from '../../../shared/contracts/commands'
import { horizons } from '../../../shared/contracts/values'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import type { Candidate, HorizonChoice, ParentKey, SmartPreview } from '../../../shared/contracts/smart-input'
import { smartMessages } from '../../i18n'

export type Field = 'title' | 'description' | 'horizon' | 'due' | 'parents' | 'flowColor'
export interface ParentInfo { itemId: string; title: string; version: number; archived: boolean; flowColor: number | null; horizon: ItemHorizon }
export interface EditableDraft {
  id: string; source: string | null; title: string; description: string
  // horizonInferred: the column is Jev's guess (text named no time), shown with a label until the user touches it.
  horizon: ItemHorizon; horizonSuggestion: ItemHorizon | null; horizonInferred: boolean; future: boolean
  due: string | null; dueSuggestion: string | null
  parents: ParentKey[]; parentSuggestions: ParentKey[]
  flowColor: number | null; manual: Field[]; roleCertain: boolean; orphan: boolean
  periods: SmartPreview['periods'] | null
}

let sequence = 0
const newId = () => `draft-${Date.now().toString(36)}-${++sequence}`
export const sameParent = (a: ParentKey, b: ParentKey) => a.kind === b.kind && (a.kind === 'existing' ? a.itemId === (b as { itemId: string }).itemId : a.draftId === (b as { draftId: string }).draftId)
const scheduled = (value: HorizonChoice): ItemHorizon => value === 'future' ? 'later' : value

export function plainDraft(text: string, previous: EditableDraft | null): EditableDraft | null {
  const plain = plainLater(text)
  if (!plain) return null
  const manual = previous?.manual.includes('title') ? previous.title : null
  return { id: previous?.id ?? newId(), source: null, title: manual ?? plain.title, description: plain.description, horizon: 'later', horizonSuggestion: null, horizonInferred: false, future: false,
    due: null, dueSuggestion: null, parents: [], parentSuggestions: [], flowColor: null, manual: manual ? ['title'] : [], roleCertain: true, orphan: false, periods: null }
}

// --- Manual fields and structure win: a fresh preview only fills fields the user never touched. ---
export function mergePreview(preview: SmartPreview, previous: EditableDraft[], removed: string[]): EditableDraft[] {
  const pool = [...previous]
  const ids = new Map<string, string>()
  const fresh = preview.drafts.filter(draft => !removed.includes(draft.source)).map(draft => {
    const index = pool.findIndex(row => row.source === draft.source)
    const old = index >= 0 ? pool.splice(index, 1)[0]! : null
    const id = old?.id ?? newId()
    ids.set(draft.draftId, id)
    return { draft, old, id }
  })
  const mapKey = (key: ParentKey): ParentKey | null => key.kind === 'existing' ? key : ids.has(key.draftId) ? { kind: 'draft', draftId: ids.get(key.draftId)! } : null
  const merged = fresh.map(({ draft, old, id }): EditableDraft => {
    const manual = old?.manual ?? []
    const keep = <T>(field: Field, value: T, current: T | undefined) => manual.includes(field) && current !== undefined ? current : value
    const horizon = scheduled(draft.horizon.value)
    const edges = preview.relations.filter(row => ids.get(row.childDraftId) === id)
    const parents = edges.filter(row => row.state === 'yes').map(row => mapKey(row.parent)).filter(key => key !== null)
    const suggestions = edges.filter(row => row.state === 'maybe').map(row => mapKey(row.parent)).filter(key => key !== null)
    return {
      id, source: draft.source, roleCertain: draft.roleCertain, orphan: false, manual, periods: preview.periods,
      title: keep('title', draft.title, old?.title), description: keep('description', draft.description, old?.description),
      ...scheduleFor(draft, horizon, manual.includes('horizon') ? old!.horizon : null), future: draft.horizon.value === 'future',
      due: keep('due', draft.due.certain ? draft.due.value : null, old?.due), dueSuggestion: draft.due.certain ? null : draft.due.value,
      parents: keep('parents', parents, old?.parents), parentSuggestions: suggestions,
      flowColor: keep('flowColor', null, old?.flowColor),
    }
  })
  // --- A judged parent the draft's column cannot link to (e.g. a Later draft under a month goal) stays a one-click suggestion. ---
  const parentHorizon = (key: ParentKey) => key.kind === 'existing' ? preview.candidates.find(row => row.itemId === key.itemId)?.horizon : merged.find(row => row.id === key.draftId)?.horizon
  for (const row of merged) {
    if (row.manual.includes('parents')) continue
    const blocked = row.parents.filter(key => { const horizon = parentHorizon(key); return !!horizon && !mayParent(horizon, row.horizon) })
    row.parents = row.parents.filter(key => !blocked.includes(key))
    row.parentSuggestions = [...blocked, ...row.parentSuggestions.filter(key => !blocked.some(other => sameParent(other, key)))]
  }
  // --- Owner decision (2026-09-25): Jev's half-sure column and parent reads are adopted into the recommendation.
  // The user still confirms with ↵ and can revert each in the adjust menus; a manual field or a move that would
  // break the column rule (for the draft or its batch children) keeps the read as a suggestion instead. ---
  const fits = (row: EditableDraft, horizon: ItemHorizon) => merged.every(child => !child.parents.some(key => key.kind === 'draft' && key.draftId === row.id) || mayParent(horizon, child.horizon))
  for (const row of merged) {
    if (row.manual.includes('horizon') || !row.horizonSuggestion || !fits(row, row.horizonSuggestion)) continue
    Object.assign(row, { horizon: row.horizonSuggestion, horizonSuggestion: null, horizonInferred: true })
  }
  for (const row of merged) {
    if (row.manual.includes('parents') || row.flowColor !== null) continue
    for (const key of row.parentSuggestions) {
      const horizon = parentHorizon(key)
      if (!horizon) continue
      const target = mayParent(horizon, row.horizon) ? row.horizon : row.manual.includes('horizon') ? null : childHorizon(horizon)
      if (!target || !fits(row, target)) continue
      row.horizon = target
      row.parents = [...row.parents, key]
      row.parentSuggestions = row.parentSuggestions.filter(other => !sameParent(other, key))
    }
  }
  // A manually shaped draft whose source no longer maps stays visible instead of being silently dropped.
  const orphans = pool.filter(row => row.manual.length && !removed.includes(row.source ?? '')).map(row => ({ ...row, orphan: true, periods: preview.periods }))
  const all = [...merged, ...orphans]
  const live = new Set(all.map(row => row.id))
  return all.map(row => ({ ...row, parents: row.parents.filter(key => key.kind === 'existing' || live.has(key.draftId)), parentSuggestions: row.parentSuggestions.filter(key => key.kind === 'existing' || live.has(key.draftId)) }))
}

export function candidateInfo(candidates: Candidate[]): Map<string, ParentInfo> {
  return new Map(candidates.map(candidate => [candidate.itemId, { itemId: candidate.itemId, title: candidate.title, version: candidate.version, archived: candidate.archived, flowColor: candidate.flowColor, horizon: candidate.horizon }]))
}
export function planItems(drafts: EditableDraft[], parents: Map<string, ParentInfo>) {
  return drafts.map(draft => ({
    draftId: draft.id, title: draft.title.trim(), description: draft.description, dueDate: draft.due, horizon: draft.horizon, previewPeriodId: draft.horizon === 'later' ? null : draft.periods?.[draft.horizon].id ?? null, flowColor: draft.flowColor,
    parentRefs: draft.parents.map((key): ParentRef => key.kind === 'draft' ? key : { kind: 'existing', itemId: key.itemId, expectedVersion: parents.get(key.itemId)!.version }),
  }))
}
export function draftProblem(drafts: EditableDraft[], parents: Map<string, ParentInfo>, usedColors: number[]): string | null {
  if (!drafts.length) return smartMessages.noDrafts
  if (drafts.some(draft => !draft.title.trim())) return smartMessages.titleRequired
  if (drafts.some(draft => draft.parents.some(key => key.kind === 'existing' && !parents.has(key.itemId)))) return smartMessages.parentMissing
  if (drafts.some(draft => draft.flowColor !== null && usedColors.includes(draft.flowColor))) return smartMessages.colorTaken
  // Mirrors the storage rule for new links: a longer-horizon parent, never Later, and no Later flow roots.
  const horizonOf = (key: ParentKey) => key.kind === 'existing' ? parents.get(key.itemId)!.horizon : drafts.find(draft => draft.id === key.draftId)?.horizon
  if (drafts.some(draft => (draft.flowColor !== null && draft.horizon === 'later') || draft.parents.some(key => { const horizon = horizonOf(key); return !!horizon && !mayParent(horizon, draft.horizon) }))) return smartMessages.relationHorizon
  return planProblem(drafts.map(draft => ({ draftId: draft.id, flowColor: draft.flowColor, parentRefs: draft.parents.map((key): ParentRef => key.kind === 'draft' ? key : { kind: 'existing', itemId: key.itemId, expectedVersion: parents.get(key.itemId)?.version ?? 1 }) })))
}
export function edited(drafts: EditableDraft[]): number { return drafts.filter(draft => draft.manual.length > 0).length }
// The longest column a child of this parent may take; null when nothing is shorter (a Today parent).
export function childHorizon(parent: ItemHorizon): ItemHorizon | null {
  return parent === 'later' ? null : horizons[horizons.indexOf(parent) + 1] ?? null
}
// A written, certain column wins; otherwise a confident guess is prefilled (labelled), and a weak one is only offered.
function scheduleFor(draft: SmartPreview['drafts'][number], written: ItemHorizon, manual: ItemHorizon | null): Pick<EditableDraft, 'horizon' | 'horizonSuggestion' | 'horizonInferred'> {
  if (manual) return { horizon: manual, horizonSuggestion: null, horizonInferred: false }
  if (draft.horizon.certain && written !== 'later') return { horizon: written, horizonSuggestion: null, horizonInferred: false }
  const guess = draft.inferredHorizon
  if (guess?.certain) return { horizon: guess.value, horizonSuggestion: null, horizonInferred: true }
  return { horizon: 'later', horizonSuggestion: written !== 'later' ? written : guess?.value ?? null, horizonInferred: false }
}
