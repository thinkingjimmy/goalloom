import { expect, it } from 'vitest'
import { draftProblem, edited, mergePreview, plainDraft, planItems, type EditableDraft, type ParentInfo } from '../../src/renderer/features/composer/draft'
import type { SmartPreview } from '../../src/shared/contracts/smart-input'

const periods = { day: { id: 'c:day:2026-09-23', startDate: '2026-09-23', endDate: '2026-09-24' }, week: { id: 'c:week:2026-09-21', startDate: '2026-09-21', endDate: '2026-09-28' }, month: { id: 'c:month:2026-09-01', startDate: '2026-09-01', endDate: '2026-10-01' }, cycle: { id: 'c:cycle:2026-07-01', startDate: '2026-07-01', endDate: '2026-10-01' } }
const preview = (drafts: { id: string; source: string; horizon?: 'day' | 'week' | 'later' | 'future'; certain?: boolean; due?: string | null }[], relations: SmartPreview['relations'] = []): SmartPreview => ({
  layout: { value: 'list', certain: true, metrics: null }, referenceDate: '2026-09-23', periods, candidates: [], relations, warnings: [], questionCount: 10, requests: 1,
  drafts: drafts.map(row => ({ draftId: row.id, source: row.source, title: row.source, description: '', roleCertain: true, horizon: { value: row.horizon ?? 'later', certain: row.certain ?? true, metrics: null }, due: { value: row.due ?? null, certain: true, metrics: null } })),
})

it('普通草稿固定单条 Later，不拆分、不因“今天”改位置', () => {
  expect(plainDraft('今天写文案\n明天改图', null)).toMatchObject({ title: '今天写文案', description: '今天写文案\n明天改图', horizon: 'late'.concat('r'), parents: [] })
})

it('新判断只填未手动修改的字段；手动结构优先；无法映射的手动项保留为 orphan', () => {
  const first = mergePreview(preview([{ id: 's1', source: '写文案', horizon: 'day' }, { id: 's2', source: '改图' }], [{ parent: { kind: 'draft', draftId: 's1' }, childDraftId: 's2', state: 'yes', probability: 0.9 }]), [], [])
  expect(first[1]!.parents).toEqual([{ kind: 'draft', draftId: first[0]!.id }])
  const manual: EditableDraft[] = first.map((row, index) => index === 0 ? { ...row, title: '写发布文案', horizon: 'week', manual: ['title', 'horizon'] } : row)
  const second = mergePreview(preview([{ id: 's1', source: '写文案', horizon: 'later' }, { id: 's2', source: '改图', horizon: 'day' }]), manual, [])
  expect(second[0]).toMatchObject({ id: first[0]!.id, title: '写发布文案', horizon: 'week' })
  expect(second[1]).toMatchObject({ id: first[1]!.id, horizon: 'day', parents: [] })
  const third = mergePreview(preview([{ id: 's1', source: '完全不同的内容' }]), second, [])
  expect(third.map(row => [row.title, row.orphan])).toEqual([['完全不同的内容', false], ['写发布文案', true]])
  expect(edited(third)).toBe(1)
  // 用户移除的片段不会被下一次判断复活。
  expect(mergePreview(preview([{ id: 's1', source: '改图' }]), [], ['改图'])).toHaveLength(0)
})

it('低确定性执行列只作建议；未来周期落 Later 并标记', () => {
  const [unsure, future] = mergePreview(preview([{ id: 's1', source: '本周写周报', horizon: 'day', certain: false }, { id: 's2', source: '明天开会', horizon: 'future' }]), [], [])
  expect(unsure).toMatchObject({ horizon: 'later', horizonSuggestion: 'day' })
  expect(future).toMatchObject({ horizon: 'later', future: true, horizonSuggestion: null })
})

it('计划负载带预览版本的既有上级与本批上级；本地复核颜色与根约束', () => {
  const drafts = mergePreview(preview([{ id: 's1', source: '方向', horizon: 'week' }, { id: 's2', source: '子项', horizon: 'day' }], [{ parent: { kind: 'draft', draftId: 's1' }, childDraftId: 's2', state: 'yes', probability: 0.9 }, { parent: { kind: 'existing', itemId: 'goal' }, childDraftId: 's2', state: 'yes', probability: 0.9 }]), [], [])
  const parents = new Map<string, ParentInfo>([['goal', { itemId: 'goal', title: '目标', version: 7, archived: true, flowColor: 2, horizon: 'month' }]])
  const items = planItems(drafts, parents)
  expect(items[0]).toMatchObject({ horizon: 'week', previewPeriodId: 'c:week:2026-09-21', parentRefs: [] })
  expect(items[1]!.parentRefs).toEqual([{ kind: 'draft', draftId: drafts[0]!.id }, { kind: 'existing', itemId: 'goal', expectedVersion: 7 }])
  expect(draftProblem(drafts, parents, [])).toBeNull()
  expect(draftProblem(drafts.map((row, i) => i === 1 ? { ...row, flowColor: 1 } : row), parents, [])).toContain('跟随上级')
  expect(draftProblem(drafts.map((row, i) => i === 0 ? { ...row, flowColor: 2 } : row), parents, [2])).toContain('已被占用')
  expect(draftProblem(drafts.map((row, i) => i === 0 ? { ...row, parents: [{ kind: 'draft', draftId: drafts[1]!.id }] } : row), parents, [])).toContain('周期更长')
  // New links need a longer-horizon parent and no Later endpoint; Later drafts start no flow.
  expect(draftProblem(drafts.map((row, i) => i === 1 ? { ...row, horizon: 'later' } : row), parents, [])).toContain('Later 不参与')
  expect(draftProblem(drafts.map((row, i) => i === 1 ? { ...row, horizon: 'week' } : row), parents, [])).toContain('周期更长')
  expect(draftProblem([{ ...drafts[0]!, horizon: 'later', flowColor: 3 }], parents, [])).toContain('Later 不参与')
})
