/**
 * [INPUT]: Editable drafts and parent metadata.
 * [OUTPUT]: linkParent/moveFor (the new-link horizon rule applied to one draft), mergeIntoPrevious (fold an uncertain fragment into the draft before it) and doubts (Jev's half-sure reads left over after adoption: uncertain deadlines, splits, and parents a manual column blocks).
 * [POS]: Pure composer helpers: leftover doubts are accepted only through the inline adjust menus.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mayParent } from '../../../domain/relations'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import type { ParentKey } from '../../../shared/contracts/smart-input'
import { childHorizon, sameParent, type EditableDraft, type Field, type ParentInfo } from './draft'

export const touch = (draft: EditableDraft, patch: Partial<EditableDraft>, ...fields: Field[]): EditableDraft =>
  ({ ...draft, ...patch, manual: [...new Set([...draft.manual, ...fields])] })

export function parentHorizon(key: ParentKey, drafts: EditableDraft[], parents: Map<string, ParentInfo>): ItemHorizon | undefined {
  return key.kind === 'existing' ? parents.get(key.itemId)?.horizon : drafts.find(row => row.id === key.draftId)?.horizon
}
export function parentTitle(key: ParentKey, drafts: EditableDraft[], parents: Map<string, ParentInfo>): string {
  return key.kind === 'existing' ? parents.get(key.itemId)?.title ?? '' : drafts.find(row => row.id === key.draftId)?.title ?? ''
}
// Accepting a parent may need the draft in a shorter column: undefined = no move, null = impossible (a Today parent).
export function moveFor(draft: EditableDraft, key: ParentKey, drafts: EditableDraft[], parents: Map<string, ParentInfo>): ItemHorizon | null | undefined {
  const horizon = parentHorizon(key, drafts, parents)
  return !horizon || mayParent(horizon, draft.horizon) ? undefined : childHorizon(horizon)
}
export function linkParent(draft: EditableDraft, key: ParentKey, drafts: EditableDraft[], parents: Map<string, ParentInfo>): EditableDraft | null {
  if (draft.parents.some(row => sameParent(row, key)) || draft.flowColor !== null) return draft
  const move = moveFor(draft, key, drafts, parents)
  if (move === null) return null
  const moved = move ? touch(draft, { horizon: move, horizonSuggestion: null, horizonInferred: false }, 'horizon') : draft
  return touch(moved, { parents: [...moved.parents, key], parentSuggestions: moved.parentSuggestions.filter(row => !sameParent(row, key)) }, 'parents')
}

// An uncertain fragment folded into the draft before it: its text joins that description, links to it follow.
export function mergeIntoPrevious(drafts: EditableDraft[], id: string): { drafts: EditableDraft[]; removedSource: string | null } | null {
  const index = drafts.findIndex(row => row.id === id)
  const draft = drafts[index], previous = drafts[index - 1]
  if (!draft || !previous) return null
  return {
    removedSource: draft.source,
    drafts: drafts.filter(row => row.id !== id).map(row => row.id === previous.id
      ? touch(row, { description: [row.description, draft.source ?? draft.title, draft.description].filter(Boolean).join('\n') }, 'description')
      : { ...row, parents: row.parents.map(key => key.kind === 'draft' && key.draftId === id ? { kind: 'draft', draftId: previous.id } : key) }),
  }
}

export type Doubt =
  | { kind: 'role'; previous: string }
  | { kind: 'parent'; key: ParentKey; title: string; move: ItemHorizon | undefined }
  | { kind: 'horizon'; horizon: ItemHorizon }
  | { kind: 'due'; date: string }
// Jev's half-sure reads for one draft, in the order the adjust menus offer them.
export function doubts(draft: EditableDraft, drafts: EditableDraft[], parents: Map<string, ParentInfo>): Doubt[] {
  const list: Doubt[] = []
  const previous = drafts[drafts.findIndex(row => row.id === draft.id) - 1]
  if (!draft.roleCertain && previous) list.push({ kind: 'role', previous: previous.title })
  if (draft.flowColor === null) for (const key of draft.parentSuggestions) {
    const move = moveFor(draft, key, drafts, parents)
    if (move !== null) list.push({ kind: 'parent', key, title: parentTitle(key, drafts, parents), move })
  }
  if (draft.horizonSuggestion && !draft.manual.includes('horizon')) list.push({ kind: 'horizon', horizon: draft.horizonSuggestion })
  if (draft.dueSuggestion && !draft.manual.includes('due')) list.push({ kind: 'due', date: draft.dueSuggestion })
  return list
}
