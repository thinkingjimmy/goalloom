/**
 * [INPUT]: 1–8 个计划草稿的 draftId、上级引用（既有条目或本批草稿）与手选流程色。
 * [OUTPUT]: planProblem 批内约束（唯一 ID、引用存在、无自环/重复、既有版本一致、有色根无上级、色互斥）与稳定拓扑序 planOrder。
 * [POS]: createPlan 的纯图规则；事务层再复核既有端点/颜色占用，导入校验复用拓扑归属。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ParentRef } from '../shared/contracts/commands'
import { serverText } from '../shared/i18n/server'

export interface PlanDraft { draftId: string; parentRefs: ParentRef[]; flowColor: number | null }

export function planProblem(drafts: PlanDraft[]): string | null {
  const ids = new Set(drafts.map(draft => draft.draftId))
  if (ids.size !== drafts.length) return serverText().relations.planDuplicateDraft
  const versions = new Map<string, number>(), colours = new Set<number>()
  for (const draft of drafts) {
    const keys = draft.parentRefs.map(ref => ref.kind === 'existing' ? `e:${ref.itemId}` : `d:${ref.draftId}`)
    if (new Set(keys).size !== keys.length) return serverText().relations.planDuplicateParent
    for (const ref of draft.parentRefs) {
      if (ref.kind === 'draft') {
        if (ref.draftId === draft.draftId) return serverText().relations.self
        if (!ids.has(ref.draftId)) return serverText().relations.planMissingParent
        continue
      }
      const seen = versions.get(ref.itemId)
      if (seen !== undefined && seen !== ref.expectedVersion) return serverText().relations.planVersionMismatch
      versions.set(ref.itemId, ref.expectedVersion)
    }
    if (draft.flowColor !== null) {
      if (draft.parentRefs.length) return serverText().relations.planParentFlow
      if (colours.has(draft.flowColor)) return serverText().relations.planDuplicateColor
      colours.add(draft.flowColor)
    }
  }
  return planOrder(drafts) ? null : serverText().relations.planCycle
}

// --- Kahn order: parents before children, siblings keep the original draft order. ---
export function planOrder<T extends PlanDraft>(drafts: T[]): T[] | null {
  const byId = new Map(drafts.map(draft => [draft.draftId, draft]))
  const pending = new Map(drafts.map(draft => [draft.draftId, draft.parentRefs.filter(ref => ref.kind === 'draft').length]))
  const ordered: T[] = []
  while (ordered.length < drafts.length) {
    const next = drafts.find(draft => pending.get(draft.draftId) === 0)
    if (!next) return null
    pending.set(next.draftId, -1)
    ordered.push(next)
    for (const draft of drafts) if (draft.parentRefs.some(ref => ref.kind === 'draft' && ref.draftId === next.draftId)) pending.set(draft.draftId, pending.get(draft.draftId)! - 1)
  }
  return ordered.every(draft => byId.has(draft.draftId)) ? ordered : null
}
