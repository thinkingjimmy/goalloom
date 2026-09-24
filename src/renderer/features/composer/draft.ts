/**
 * [INPUT]: Smart preview, previous edits, original preview periods and flow constraints.
 * [OUTPUT]: Manual-priority draft merging, orphan handling and versioned createPlan payloads.
 * [POS]: Pure composer state; preserves period identity instead of rebasing stale previews.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { planProblem } from '../../../domain/plan'
import { plainLater } from '../../../domain/smart/segments'
import type { ParentRef } from '../../../shared/contracts/commands'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import type { Candidate, HorizonChoice, ParentKey, SmartPreview } from '../../../shared/contracts/smart-input'
import { smartMessages } from '../../i18n'

export type Field = 'title' | 'description' | 'horizon' | 'due' | 'parents' | 'flowColor'
export interface ParentInfo { itemId: string; title: string; version: number; archived: boolean; flowColor: number | null; horizon: ItemHorizon }
export interface EditableDraft {
  id: string; source: string | null; title: string; description: string
  horizon: ItemHorizon; horizonSuggestion: ItemHorizon | null; future: boolean
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
  return { id: previous?.id ?? newId(), source: null, title: manual ?? plain.title, description: plain.description, horizon: 'later', horizonSuggestion: null, future: false,
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
      horizon: keep('horizon', draft.horizon.certain ? horizon : 'later', old?.horizon), horizonSuggestion: draft.horizon.certain || horizon === 'later' ? null : horizon, future: draft.horizon.value === 'future',
      due: keep('due', draft.due.certain ? draft.due.value : null, old?.due), dueSuggestion: draft.due.certain ? null : draft.due.value,
      parents: keep('parents', parents, old?.parents), parentSuggestions: suggestions,
      flowColor: keep('flowColor', null, old?.flowColor),
    }
  })
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
  return planProblem(drafts.map(draft => ({ draftId: draft.id, flowColor: draft.flowColor, parentRefs: draft.parents.map((key): ParentRef => key.kind === 'draft' ? key : { kind: 'existing', itemId: key.itemId, expectedVersion: parents.get(key.itemId)?.version ?? 1 }) })))
}
export function edited(drafts: EditableDraft[]): number { return drafts.filter(draft => draft.manual.length > 0).length }
